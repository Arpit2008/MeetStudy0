"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";

// Types
interface UserData {
  id: string;
}

interface PartnerData extends UserData {
  isInitiator: boolean;
}

interface SessionData {
  sessionId: string;
  partner: PartnerData;
  isInitiator: boolean;
}

// Ice servers for WebRTC - Using reliable free TURN servers
// OpenRelay (free, no auth needed) + Google STUN
const iceServers = [
  // Google STUN servers
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  // OpenRelay TURN servers (free, no authentication required)
  { urls: "turn:openrelay.metered.ca:443" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp" }
];

export default function StudyBuddyConnect() {
  // App states
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem("studybuddy-theme");
      if (savedTheme === "dark") {
        document.documentElement.classList.add("dark");
        return true;
      }
    }
    return false;
  });
  const [currentView, setCurrentView] = useState<"landing" | "searching" | "session">("landing");
  
  // Session states
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isCameraMuted, setIsCameraMuted] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [searchPosition, setSearchPosition] = useState(1);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [hasLocalStream, setHasLocalStream] = useState(false);
  const [isPeerConnected, setIsPeerConnected] = useState(false);
  
  // Refs
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const [chatMessages, setChatMessages] = useState<{ sender: string; text: string }[]>([]);
  const [chatInput, setChatInput] = useState("");

  // Refs for callbacks that need to be accessed before declaration
  const endSessionRef = useRef<() => void>(() => {});

  // Get actual duration - default 30 minutes
  const getActualDuration = useCallback(() => {
    return 30; // Default 30 minutes
  }, []);

  // Toggle dark mode
  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((prev) => {
      const newValue = !prev;
      if (newValue) {
        document.documentElement.classList.add("dark");
        localStorage.setItem("studybuddy-theme", "dark");
      } else {
        document.documentElement.classList.remove("dark");
        localStorage.setItem("studybuddy-theme", "light");
      }
      return newValue;
    });
  }, []);

  // End session function
  const endSession = useCallback(() => {
    // Stop timer
    if (timerRef.current) clearInterval(timerRef.current);

    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Reset state
    setHasLocalStream(false);
    setIsPeerConnected(false);
    setCurrentView("landing");
    setSessionData(null);
    setTimeRemaining(0);
    setIsPaused(false);
    setIsCameraMuted(false);
    setIsMicMuted(false);
    setChatMessages([]);

    // Notify server
    if (socketRef.current && sessionData) {
      socketRef.current.emit("end-session", { sessionId: sessionData.sessionId });
    }
  }, [sessionData]);

  // Update ref when endSession changes
  useEffect(() => {
    endSessionRef.current = endSession;
  }, [endSession]);

  // WebRTC Functions
  const startWebRTC = useCallback(async (data: SessionData) => {
    try {
      // Get local media stream - always video now
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      
      localStreamRef.current = stream;
      setHasLocalStream(true);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // ICE server configuration - using reliable free TURN servers
      const pcConfig = {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
          { urls: "stun:stun3.l.google.com:19302" },
          { urls: "stun:stun4.l.google.com:19302" },
          { urls: "turn:openrelay.metered.ca:443" },
          { urls: "turn:openrelay.metered.ca:443?transport=tcp" }
        ],
        iceCandidatePoolSize: 10
      };
      
      // Create peer connection
      const pc = new RTCPeerConnection(pcConfig);
      peerConnectionRef.current = pc;

      // Add local tracks
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Handle incoming tracks
      pc.ontrack = (event) => {
        setIsPeerConnected(true);
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      // Handle ICE connection state changes for debugging
      pc.oniceconnectionstatechange = () => {
        console.log("ICE Connection State:", pc.iceConnectionState);
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
          setIsPeerConnected(true);
        }
        if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") {
          console.log("ICE Connection failed or disconnected, attempting to reconnect...");
          // Try to restart ICE
          pc.restartIce();
        }
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current && sessionData) {
          // Send ICE candidate to peer through signaling server
          socketRef.current.emit("ice-candidate", {
            sessionId: sessionData.sessionId,
            candidate: event.candidate,
            targetId: sessionData.partner.id,
          });
        }
      };

      // Create data channel for chat (always available for text communication)
      const channel = pc.createDataChannel("chat");
      dataChannelRef.current = channel;
      
      channel.onmessage = (event) => {
        const message = JSON.parse(event.data);
        setChatMessages((prev) => [...prev, message]);
      };
      
      pc.ondatachannel = (event) => {
        dataChannelRef.current = event.channel;
        event.channel.onmessage = (e) => {
          const message = JSON.parse(e.data);
          setChatMessages((prev) => [...prev, message]);
        };
      };

      // If initiator, create offer
      if (data.isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        socketRef.current?.emit("webrtc-offer", {
          sessionId: data.sessionId,
          offer,
          targetId: data.partner.id,
        });
      }
    } catch (error) {
      console.error("Error starting WebRTC:", error);
      alert("Could not access camera/microphone. Please check permissions.");
      endSessionRef.current();
    }
  }, [sessionData]);

  const handleWebRTCOffer = useCallback(async (data: { offer: RTCSessionDescriptionInit; from: string; sessionId: string }) => {
    try {
      if (!peerConnectionRef.current) {
        // Create peer connection if not exists - use same config
        const pcConfig = {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
            { urls: "stun:stun3.l.google.com:19302" },
            { urls: "stun:stun4.l.google.com:19302" },
            { urls: "turn:openrelay.metered.ca:443" },
            { urls: "turn:openrelay.metered.ca:443?transport=tcp" }
          ],
          iceCandidatePoolSize: 10
        };
        const pc = new RTCPeerConnection(pcConfig);
        peerConnectionRef.current = pc;

        // Handle incoming tracks
        pc.ontrack = (event) => {
          setIsPeerConnected(true);
          if (remoteVideoRef.current && event.streams[0]) {
            remoteVideoRef.current.srcObject = event.streams[0];
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate && socketRef.current && sessionData) {
            socketRef.current.emit("ice-candidate", {
              sessionId: sessionData.sessionId,
              candidate: event.candidate,
              targetId: sessionData?.partner.id,
            });
          }
        };

        // Handle ICE connection state changes
        pc.oniceconnectionstatechange = () => {
          console.log("ICE Connection State:", pc.iceConnectionState);
          if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
            setIsPeerConnected(true);
          }
        };

        // Get local stream - always video now
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        localStreamRef.current = stream;
        setHasLocalStream(true);
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        // Always create data channel for chat
        pc.ondatachannel = (event) => {
          dataChannelRef.current = event.channel;
          event.channel.onmessage = (e) => {
            const message = JSON.parse(e.data);
            setChatMessages((prev) => [...prev, message]);
          };
        };
      }

      await peerConnectionRef.current.setRemoteDescription(data.offer);
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);

      socketRef.current?.emit("webrtc-answer", {
        sessionId: data.sessionId,
        answer,
        targetId: data.from,
      });
    } catch (error) {
      console.error("Error handling offer:", error);
    }
  }, [sessionData]);

  const handleWebRTCAnswer = useCallback(async (data: { answer: RTCSessionDescriptionInit; from: string }) => {
    try {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(data.answer);
      }
    } catch (error) {
      console.error("Error handling answer:", error);
    }
  }, []);

  const handleIceCandidate = useCallback(async (data: { candidate: RTCIceCandidateInit; from: string }) => {
    try {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    } catch (error) {
      console.error("Error adding ICE candidate:", error);
    }
  }, []);

  // Toggle camera
  const toggleCamera = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraMuted(!videoTrack.enabled);
      }
    }
  }, []);

  // Toggle microphone
  const toggleMic = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicMuted(!audioTrack.enabled);
      }
    }
  }, []);

  // Send chat message
  const sendChatMessage = useCallback(() => {
    if (chatInput.trim() && dataChannelRef.current) {
      const message = { sender: "You", text: chatInput.trim() };
      dataChannelRef.current.send(JSON.stringify(message));
      setChatMessages((prev) => [...prev, message]);
      setChatInput("");
    }
  }, [chatInput]);

  // Initialize dark mode from localStorage
  const initializeDarkMode = useCallback(() => {
    const savedTheme = localStorage.getItem("studybuddy-theme");
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
      return true;
    }
    return false;
  }, []);

  // Initialize Socket.io
  const initSocket = useCallback(() => {
    if (!socketRef.current) {
      socketRef.current = io({
        autoConnect: true,
        reconnection: true,
        timeout: 10000,
      });

      socketRef.current.on("connect", () => {
        console.log("Connected to server:", socketRef.current?.id);
      });

      socketRef.current.on("waiting", (data: { position: number }) => {
        console.log("Waiting in queue, position:", data.position);
        setSearchPosition(data.position);
      });

      socketRef.current.on("match-found", (data: SessionData) => {
        console.log("Match found!", data);
        setSessionData(data);
        setCurrentView("session");
        setTimeRemaining(30 * 60); // Default 30 minutes
        
        // Start WebRTC connection - always video
        startWebRTC(data);
      });

      socketRef.current.on("webrtc-offer", async (data: { offer: RTCSessionDescriptionInit; from: string; sessionId: string }) => {
        await handleWebRTCOffer(data);
      });

      socketRef.current.on("webrtc-answer", async (data: { answer: RTCSessionDescriptionInit; from: string }) => {
        await handleWebRTCAnswer(data);
      });

      socketRef.current.on("ice-candidate", async (data: { candidate: RTCIceCandidateInit; from: string }) => {
        await handleIceCandidate(data);
      });

      socketRef.current.on("session-ended", (data: { reason: string }) => {
        console.log("Session ended:", data.reason);
        endSession();
      });

      socketRef.current.on("disconnect", () => {
        console.log("Disconnected from server");
      });
      
      socketRef.current.on("connect_error", (error) => {
        console.error("Socket connection error:", error);
      });
    }
    return socketRef.current;
  }, [startWebRTC, handleWebRTCOffer, handleWebRTCAnswer, handleIceCandidate, endSession]);

  // Find partner - simplified
  const findPartner = useCallback(() => {
    const socket = initSocket();
    setCurrentView("searching");

    // Wait for socket to be connected before emitting
    let attempts = 0;
    const emitJoinQueue = () => {
      attempts++;
      if (attempts > 25) { // 5 seconds max wait
        console.log("Timeout waiting for socket connection");
        setCurrentView("landing");
        return;
      }
      
      if (!socket.connected) {
        console.log("Socket not connected, waiting... attempt", attempts);
        setTimeout(emitJoinQueue, 200);
        return;
      }
      
      const userData: UserData = {
        id: socket.id || `user-${Date.now()}`,
      };

      console.log("Socket connected, joining queue with id:", socket.id);
      socket.emit("join-queue", userData);
    };
    
    emitJoinQueue();
  }, [initSocket]);

  // Cancel search
  const cancelSearch = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit("leave-queue");
    }
    setCurrentView("landing");
  }, []);

  // Timer
  useEffect(() => {
    if (currentView === "session" && timeRemaining > 0 && !isPaused) {
      timerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            setShowCompletionModal(true);
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentView, isPaused, timeRemaining]);

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Close completion modal
  const closeCompletionModal = useCallback(() => {
    setShowCompletionModal(false);
    endSession();
  }, [endSession]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  return (
    <div className={`min-h-screen ${isDarkMode ? "dark bg-slate-900" : "bg-gradient-to-b from-sky-100 via-sky-50 to-white"}`}>
      {/* Background Shapes */}
      <div className="bg-shapes">
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>
        <div className="shape shape-3"></div>
      </div>

      {/* Dark Mode Toggle */}
      <button
        onClick={toggleDarkMode}
        className="dark-toggle control-btn"
        title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
      >
        {isDarkMode ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </button>

      {/* Main Content */}
      <main className="relative min-h-screen flex flex-col items-center justify-center p-4 sm:p-6">
        
        {/* Landing View */}
        {currentView === "landing" && (
          <div className="w-full max-w-md animate-fade-in-up">
            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-4xl sm:text-5xl font-bold mb-3 bg-gradient-to-r from-sky-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
                StudyBuddy Connect
              </h1>
              <p className={`text-lg ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
                Find your perfect study partner instantly
              </p>
            </div>

            {/* Simple Find Partner Panel */}
            <div className="glass rounded-3xl p-8 text-center">
              <div className="text-6xl mb-4">🎓</div>
              <p className="text-white/80 mb-6">
                Connect instantly with a random study partner for a 30-minute video session
              </p>
              
              {/* Find Partner Button */}
              <button
                onClick={findPartner}
                className="w-full gradient-btn py-5 rounded-xl text-white font-bold text-xl shadow-lg hover:shadow-xl transition-all transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <span className="flex items-center justify-center gap-3">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Find a Study Partner
                </span>
              </button>
              
              <p className="text-white/50 text-sm mt-4">
                🔒 No login required • 100% private
              </p>
            </div>
          </div>
        )}

        {/* Searching View */}
        {currentView === "searching" && (
          <div className="text-center animate-fade-in-up">
            <div className="glass rounded-3xl p-12">
              {/* Animated Search Icon */}
              <div className="flex justify-center mb-8">
                <div className="relative">
                  <div className="w-24 h-24 flex items-center justify-center">
                    <div className="spinner"></div>
                  </div>
                  <svg
                    className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-12 h-12 text-sky-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                </div>
              </div>

              <h2 className="text-2xl font-semibold text-white mb-3">
                Searching for a Study Partner...
              </h2>
              <p className={`text-lg mb-6 ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
                Position in queue: <span className="text-sky-400 font-bold">{searchPosition}</span>
              </p>
              <p className={`text-sm mb-8 ${isDarkMode ? "text-slate-500" : "text-slate-500"}`}>
                Looking for a study partner... •
                <span className="text-white">30 min video session</span>
              </p>

              <button
                onClick={cancelSearch}
                className="px-8 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Session View */}
        {currentView === "session" && (
          <div className="w-full h-screen flex flex-col animate-fade-in-up p-4">
            {/* Timer Bar */}
            <div className="flex justify-center mb-4">
              <div className="glass rounded-full px-6 py-3 flex items-center gap-4">
                <span className="text-white/70">Time Remaining:</span>
                <span className={`timer-display text-2xl font-bold text-white ${timeRemaining < 60 ? "text-red-400" : "text-sky-400"}`}>
                  {formatTime(timeRemaining)}
                </span>
                <button
                  onClick={() => setIsPaused(!isPaused)}
                  className="p-2 rounded-full hover:bg-white/10 transition-all"
                  title={isPaused ? "Resume" : "Pause"}
                >
                  {isPaused ? (
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Video/Chat Grid */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* My Video */}
              <div className="video-container relative min-h-[300px]">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="mirror w-full h-full"
                />
                {!hasLocalStream ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-sky-500/20 flex items-center justify-center">
                        <span className="text-3xl">👤</span>
                      </div>
                      <p className="text-white/70">You</p>
                    </div>
                  </div>
                ) : null}
                <div className="absolute bottom-4 left-4 glass rounded-lg px-3 py-1">
                  <span className="text-white text-sm">You</span>
                </div>
                {isCameraMuted && (
                  <div className="absolute top-4 right-4 bg-red-500/80 rounded-full p-2">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Partner Video */}
              <div className="video-container relative min-h-[300px]">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full"
                />
                <div className="absolute bottom-4 left-4 glass rounded-lg px-3 py-1">
                  <span className="text-white text-sm">Partner</span>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex justify-center gap-4">
              <button
                onClick={toggleCamera}
                className={`control-btn ${isCameraMuted ? "muted" : ""}`}
                title={isCameraMuted ? "Turn on camera" : "Turn off camera"}
              >
                {isCameraMuted ? (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
              <button
                onClick={toggleMic}
                className={`control-btn ${isMicMuted ? "muted" : ""}`}
                title={isMicMuted ? "Unmute" : "Mute"}
              >
                {isMicMuted ? (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                )}
              </button>
              <button
                onClick={endSession}
                className="control-btn !bg-red-500 hover:!bg-red-600"
                title="End Session"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Completion Modal */}
      {showCompletionModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-white mb-3">
              Great Job!
            </h2>
            <p className="text-white/70 mb-6">
              You completed your study session. Keep up the great work!
            </p>
            <button
              onClick={closeCompletionModal}
              className="gradient-btn px-8 py-3 rounded-xl text-white font-semibold"
            >
              Back to Home
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
