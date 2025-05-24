import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

let playlist = [];
let currentIndex = 0;
let isPlaying = false;
let currentTime = 0;
let hostSocketId = null;

async function fetchVideoMetadata(videoUrl) {
  try {
    const videoIdMatch = videoUrl.match(
      /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|embed|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/
    );
    if (!videoIdMatch) throw new Error("Invalid YouTube URL");
    const videoId = videoIdMatch[1];

    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    if (!res.ok) throw new Error("Video not found");
    const data = await res.json();
    return {
      id: videoId,
      ...data,
    };
  } catch {
    return null;
  }
}

app.get("/api/video-info", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "Missing url param" });
  const meta = await fetchVideoMetadata(url);
  if (!meta) return res.status(404).json({ error: "Video not found" });
  res.json(meta);
});

io.on("connection", (socket) => {
  console.log("Client connected", socket.id);

  socket.on("join-room", (roomId, isHost) => {
    socket.join(roomId);
    if (isHost) {
      hostSocketId = socket.id;
    }
    socket.emit("init", { playlist, currentIndex, isPlaying, currentTime });
  });

  socket.on("add-video", ({ roomId, videoMeta }) => {
    playlist.push(videoMeta);
    io.to(roomId).emit("playlist-updated", playlist);
  });

  socket.on("play-video", ({ roomId, index, isPlaying: playing }) => {
    if (socket.id === hostSocketId) {
      currentIndex = index;
      isPlaying = playing;
      io.to(roomId).emit("play-video", { currentIndex: index, isPlaying });
    }
  });

  socket.on("pause-video", ({ roomId }) => {
    if (socket.id === hostSocketId) {
      isPlaying = false;
      io.to(roomId).emit("pause-video");
    }
  });

  socket.on("playback-time-update", ({ roomId, time }) => {
    if (socket.id === hostSocketId) {
      currentTime = time;
      socket.to(roomId).emit("playback-time-update", time);
    }
  });

  socket.on("disconnect", () => {
    if (socket.id === hostSocketId) {
      hostSocketId = null;
    }
    console.log("Client disconnected", socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
