import React, { useState, useEffect, useRef } from 'react';
import io from "socket.io-client";
import SimplePeer from "simple-peer";
import './App.css';

// Add polyfills
import 'buffer';
import process from 'process';
window.process = process;
window.global = window;

const socket = io("http://localhost:5000");

const VideoScreen = ({ stream, username }) => {
  const videoRef = useRef();

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="video-container">
      <h3>{username}</h3>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={username === "You"}
        className="video-screen"
      />
    </div>
  );
};

export const App = () => {
  const [sessionId, setSessionId] = useState("");
  const [joinSessionId, setJoinSessionId] = useState("");
  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState({});
  const [remoteStreams, setRemoteStreams] = useState({});
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    socket.on("session-created", ({ sessionId }) => {
      setSessionId(sessionId);
      console.log("Created session:", sessionId);
    });

    socket.on("participant-joined", ({ participantId }) => {
      console.log("Participant joined:", participantId);
      if (isSharing) {
        // If we're currently sharing, initiate a connection with the new participant
        initiateShare(participantId);
      }
    });

    socket.on("user-started-sharing", ({ userId }) => {
      console.log("User started sharing:", userId);
    });

    socket.on("signal", ({ from, signal }) => {
      console.log("Received signal from:", from);
      
      if (peers[from]) {
        peers[from].signal(signal);
      } else {
        const peer = new SimplePeer({
          initiator: false,
          trickle: false
        });

        peer.on("signal", (signal) => {
          socket.emit("signal", { to: from, signal });
        });

        peer.on("stream", (stream) => {
          setRemoteStreams(prev => ({
            ...prev,
            [from]: stream
          }));
        });

        peer.signal(signal);
        setPeers(prev => ({ ...prev, [from]: peer }));
      }
    });

    socket.on("user-stopped-sharing", ({ userId }) => {
      setRemoteStreams(prev => {
        const newStreams = { ...prev };
        delete newStreams[userId];
        return newStreams;
      });
    });

    return () => {
      socket.off("session-created");
      socket.off("participant-joined");
      socket.off("user-started-sharing");
      socket.off("signal");
      socket.off("user-stopped-sharing");
    };
  }, [peers, isSharing]);

  const initiateShare = async (participantId) => {
    try {
      const peer = new SimplePeer({
        initiator: true,
        trickle: false,
        stream: localStream
      });

      peer.on("signal", (signal) => {
        socket.emit("signal", { to: participantId, signal });
      });

      setPeers(prev => ({ ...prev, [participantId]: peer }));
    } catch (err) {
      console.error("Error initiating share:", err);
      setError("Failed to initiate sharing");
    }
  };

  const createSession = () => {
    socket.emit("create-session");
  };

  const joinSession = () => {
    if (joinSessionId) {
      socket.emit("join-session", joinSessionId);
      setSessionId(joinSessionId);
    }
  };

  const shareScreen = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

      setLocalStream(stream);
      setIsSharing(true);
      socket.emit("start-sharing", sessionId);

      // Share with all existing peers
      Object.entries(peers).forEach(([participantId, peer]) => {
        peer.addStream(stream);
      });

      // Handle stream stop
      stream.getVideoTracks()[0].onended = () => {
        stopSharing();
      };
    } catch (err) {
      console.error("Error sharing screen:", err);
      setError("Failed to share screen");
    }
  };

  const stopSharing = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
      setIsSharing(false);
      socket.emit("stop-sharing", sessionId);
    }
  };

  return (
    <div className="container">
      {error && <div className="error-message">{error}</div>}
      
      <div className="control-panel">
        <h2>Screen Sharing Session</h2>
        
        {!sessionId ? (
          <div className="session-controls">
            <div>
              <button onClick={createSession} className="button">
                Create New Session
              </button>
            </div>
            <div className="join-session">
              <input
                type="text"
                placeholder="Enter Session ID"
                value={joinSessionId}
                onChange={(e) => setJoinSessionId(e.target.value)}
                className="input"
              />
              <button onClick={joinSession} className="button">
                Join Session
              </button>
            </div>
          </div>
        ) : (
          <div className="session-info">
            <p>Session ID: {sessionId}</p>
            {!isSharing ? (
              <button onClick={shareScreen} className="button">
                Share Screen
              </button>
            ) : (
              <button onClick={stopSharing} className="button stop">
                Stop Sharing
              </button>
            )}
          </div>
        )}
      </div>

      <div className="video-grid">
        {localStream && (
          <VideoScreen stream={localStream} username="You" />
        )}
        
        {Object.entries(remoteStreams).map(([peerId, stream]) => (
          <VideoScreen
            key={peerId}
            stream={stream}
            username={`Participant ${peerId.slice(0, 4)}`}
          />
        ))}
      </div>
    </div>
  );
};

export default App;