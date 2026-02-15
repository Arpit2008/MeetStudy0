"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";

// Types
interface UserData {
  id: string;
  topic: string;
  duration: number;
  gender: string;
  genderPreference: string;
  studyMode: "video" | "text";
}

interface PartnerData extends UserData {
  isInitiator: boolean;
}

interface SessionData {
  sessionId: string;
  partner: PartnerData;
  isInitiator: boolean;
}

// Ice servers for WebRTC (STUN + TURN for better connectivity across devices)
const iceServers = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { 
    urls: "turn:global.turn.metered.ca:80",
    username: "metered",
    credential: "metered"
  },
  { 
    urls: "turn:global.turn.metered.ca:443",
    username: "metered",
    credential: "metered"
  },
  {
    urls: "turn:global.turn.metered.ca:443?transport=tcp",
    username: "metered",
    credential: "metered"
  }
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
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [currentView, setCurrentView] = useState<"landing" | "searching" | "session">("landing");
  
  // User preferences
  const [duration, setDuration] = useState<string>("30");
  const [customDuration, setCustomDuration] = useState("");
  const [genderPreference, setGenderPreference] = useState("Any");
  const [topic, setTopic] = useState("");
  const [studyMode, setStudyMode] = useState<"video" | "text">("video");
  
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

  // Get actual duration
  const getActualDuration = useCallback(() => {
    if (duration === "custom" && customDuration) {
      return parseInt(customDuration);
    }
    return duration === "custom" ? 30 : parseInt(duration);
  }, [duration, customDuration]);

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

  // Toggle sound
  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => !prev);
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
      // Get local media stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: studyMode === "video",
        audio: true,
      });
      
      localStreamRef.current = stream;
      setHasLocalStream(true);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Create peer connection
      const pc = new RTCPeerConnection({ iceServers });
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

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current && sessionData) {
          socketRef.current.emit("ice-candidate", {
            sessionId: sessionData.sessionId,
            candidate: event.candidate,
            targetId: sessionData.partner.id,
          });
        }
      };

      // Create data channel for chat (if text mode)
      if (studyMode === "text") {
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
      }

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
  }, [studyMode, sessionData]);

  const handleWebRTCOffer = useCallback(async (data: { offer: RTCSessionDescriptionInit; from: string; sessionId: string }) => {
    try {
      if (!peerConnectionRef.current) {
        // Create peer connection if not exists
        const pc = new RTCPeerConnection({ iceServers });
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

        // Get local stream
        const stream = await navigator.mediaDevices.getUserMedia({
          video: studyMode === "video",
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

        // Create data channel for chat
        if (studyMode === "text") {
          pc.ondatachannel = (event) => {
            dataChannelRef.current = event.channel;
            event.channel.onmessage = (e) => {
              const message = JSON.parse(e.data);
              setChatMessages((prev) => [...prev, message]);
            };
          };
        }
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
  }, [studyMode, sessionData]);

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
      });

      socketRef.current.on("connect", () => {
        console.log("Connected to server:", socketRef.current?.id);
      });

      socketRef.current.on("waiting", (data: { position: number }) => {
        setSearchPosition(data.position);
      });

      socketRef.current.on("match-found", (data: SessionData) => {
        console.log("Match found!", data);
        setSessionData(data);
        setCurrentView("session");
        setTimeRemaining(getActualDuration() * 60);
        
        // Start WebRTC connection
        if (studyMode === "video") {
          startWebRTC(data);
        }
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
    }
    return socketRef.current;
  }, [studyMode, getActualDuration, startWebRTC, handleWebRTCOffer, handleWebRTCAnswer, handleIceCandidate, endSession]);

  // Find partner
  const findPartner = useCallback(() => {
    if (!topic.trim()) {
      alert("Please enter a subject or topic");
      return;
    }

    const socket = initSocket();
    setCurrentView("searching");

    const userData: UserData = {
      id: socket.id || "",
      topic: topic.trim(),
      duration: getActualDuration(),
      gender: "Any",
      genderPreference,
      studyMode,
    };

    socket.emit("join-queue", userData);
  }, [topic, genderPreference, studyMode, initSocket, getActualDuration]);

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

      {/* Sound Toggle */}
      <button
        onClick={toggleSound}
        className={`sound-toggle control-btn ${soundEnabled ? "active" : ""}`}
        title={soundEnabled ? "Mute Sounds" : "Enable Sounds"}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          {soundEnabled ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          )}
        </svg>
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

            {/* Input Panel - Glassmorphism */}
            <div className="glass rounded-3xl p-6 sm:p-8">
              <h2 className="text-xl font-semibold text-white mb-6 text-center">
                Set Your Preferences
              </h2>

              {/* Study Duration */}
              <div className="mb-6">
                <label className="flex items-center gap-2 text-sm font-medium text-white/90 mb-3">
                  <svg className="w-4 h-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Study Duration
                </label>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {["30", "45", "60", "90", "120", "180"].map((d) => (
                    <button
                      key={d}
                      onClick={() => { setDuration(d); setCustomDuration(""); }}
                      className={`duration-btn ${duration === d && !customDuration ? "selected" : ""}`}
                    >
                      {parseInt(d) >= 60 ? `${parseInt(d)/60}h` : `${d}m`}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDuration("custom")}
                    className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
                      duration === "custom" 
                        ? "bg-sky-500 text-white" 
                        : "bg-white/10 text-white/60 hover:bg-white/20"
                    }`}
                  >
                    Custom
                  </button>
                  {duration === "custom" && (
                    <input
                      type="number"
                      placeholder="minutes"
                      value={customDuration}
                      onChange={(e) => setCustomDuration(e.target.value)}
                      className="input-field flex-1 text-sm py-2"
                      min={1}
                      max={300}
                    />
                  )}
                </div>
              </div>

              {/* Topic/Subject */}
              <div className="mb-6">
                <label className="flex items-center gap-2 text-sm font-medium text-white/90 mb-3">
                  <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  Subject or Topic
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="What do you want to study?"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="input-field pl-10"
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>
                {/* Quick topic suggestions */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {["Math", "Programming", "Physics", "Chemistry", "Languages", "History"].map((t) => (
                    <button
                      key={t}
                      onClick={() => setTopic(t)}
                      className={`text-xs px-3 py-1 rounded-full transition-all ${
                        topic.toLowerCase() === t.toLowerCase()
                          ? "bg-purple-500 text-white"
                          : "bg-white/10 text-white/60 hover:bg-white/20"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Study Mode */}
              <div className="mb-6">
                <label className="flex items-center gap-2 text-sm font-medium text-white/90 mb-3">
                  <svg className="w-4 h-4 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Study Mode
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setStudyMode("video")}
                    className={`mode-btn ${studyMode === "video" ? "selected" : ""}`}
                  >
                    <div className="text-2xl mb-1">📹</div>
                    <div className="font-medium">Video Call</div>
                    <div className="text-xs opacity-70">Face to face</div>
                  </button>
                  <button
                    onClick={() => setStudyMode("text")}
                    className={`mode-btn ${studyMode === "text" ? "selected" : ""}`}
                  >
                    <div className="text-2xl mb-1">💬</div>
                    <div className="font-medium">Text Chat</div>
                    <div className="text-xs opacity-70">Type messages</div>
                  </button>
                </div>
              </div>

              {/* Gender Preference */}
              <div className="mb-8">
                <label className="flex items-center gap-2 text-sm font-medium text-white/90 mb-3">
                  <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Partner Preference
                </label>
                <div className="flex gap-2">
                  {["Any", "Male", "Female"].map((option) => (
                    <button
                      key={option}
                      onClick={() => setGenderPreference(option)}
                      className={`gender-btn flex-1 ${genderPreference === option ? "selected" : ""}`}
                    >
                      {option === "Any" ? "👥 Anyone" : option === "Male" ? "👨 Male" : "👩 Female"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Find Partner Button */}
              <button
                onClick={findPartner}
                className="w-full gradient-btn py-4 rounded-xl text-white font-semibold text-lg shadow-lg hover:shadow-xl transition-all transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Find Study Partner
                </span>
              </button>
            </div>

            {/* Privacy Message */}
            <p className={`text-center mt-6 text-sm ${isDarkMode ? "text-slate-500" : "text-slate-500"}`}>
              🔒 No login. No history saved. 100% private sessions.
            </p>
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
                Looking for: <span className="text-white">{topic || "Any topic"}</span> •{" "}
                <span className="text-white">{getActualDuration()} min</span> •{" "}
                <span className="text-white">{studyMode === "video" ? "📹 Video" : "💬 Text"}</span>
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
                  className={`mirror w-full h-full ${studyMode === "text" ? "hidden" : ""}`}
                />
                {studyMode === "text" || !hasLocalStream ? (
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
                  className={`w-full h-full ${studyMode === "text" ? "hidden" : ""}`}
                />
                {studyMode === "text" ? (
                  <div className="absolute inset-0 flex flex-col">
                    <div className="flex-1 overflow-y-auto p-4 space-y-3" ref={chatMessagesRef}>
                      {chatMessages.map((msg, idx) => (
                        <div
                          key={idx}
                          className={`flex ${msg.sender === "You" ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                              msg.sender === "You"
                                ? "bg-sky-500 text-white"
                                : "bg-white/10 text-white"
                            }`}
                          >
                            <p className="text-sm">{msg.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="p-4 border-t border-white/10">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && sendChatMessage()}
                          placeholder="Type a message..."
                          className="flex-1 input-field"
                        />
                        <button
                          onClick={sendChatMessage}
                          className="px-4 py-2 bg-sky-500 rounded-xl text-white hover:bg-sky-600 transition-all"
                        >
                          Send
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
                {!isPeerConnected && studyMode === "video" && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-purple-500/20 flex items-center justify-center animate-pulse">
                        <span className="text-3xl">🔗</span>
                      </div>
                      <p className="text-white/70">Connecting to partner...</p>
                    </div>
                  </div>
                )}
                <div className="absolute bottom-4 left-4 glass rounded-lg px-3 py-1">
                  <span className="text-white text-sm">Partner</span>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex justify-center gap-4">
              {studyMode === "video" && (
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
              )}
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
