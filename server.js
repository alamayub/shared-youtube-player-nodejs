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
const ROOM_ID = "default-room";

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
      title: data.title,
      author: data.author_name,
      thumbnail: data.thumbnail_url,
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
  console.log("New client connected", socket.id);

  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    console.log(`${socket.id} joined room ${roomId}`);

    // Send current state including currentTime on join
    socket.emit("init", { playlist, currentIndex, isPlaying, currentTime });
  });

  socket.on("update-playlist", ({ roomId, playlist: newPlaylist }) => {
    playlist = newPlaylist;
    io.to(roomId).emit("playlist-updated", playlist);
  });

  socket.on("play-video", ({ roomId, index, isPlaying: playing }) => {
    currentIndex = index;
    isPlaying = playing;
    io.to(roomId).emit("play-video", {
      currentIndex: index,
      isPlaying: playing,
    });
  });

  socket.on("pause-video", ({ roomId }) => {
    isPlaying = false;
    io.to(roomId).emit("pause-video");
  });

  socket.on("playback-time-update", ({ roomId, time }) => {
    currentTime = time;
    // Broadcast updated time to all except sender
    socket.to(roomId).emit("playback-time-update", time);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected", socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
