"use client";

/* eslint-disable react-hooks/preserve-manual-memoization */

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
  isBotSession?: boolean;
}

// Ice servers for WebRTC - Using reliable free STUN servers
const iceServers = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
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
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
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

  // Initialize Socket.io - simplified and more reliable
  const initSocket = useCallback(() => {
    if (socketRef.current?.connected) {
      console.log("Socket already connected:", socketRef.current.id);
      setIsConnecting(false);
      return socketRef.current;
    }
    
    // Disconnect existing socket if not connected
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    
    // Use explicit localhost URL for development
    const serverUrl = 'http://localhost:3000';
    
    console.log("🔌 Connecting to socket server:", serverUrl);
    setIsConnecting(true);
    
    socketRef.current = io(serverUrl, {
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      transports: ['websocket', 'polling'],
      forceNew: true,
    });

    socketRef.current.on("connect", () => {
      console.log("✅ Connected to server! Socket ID:", socketRef.current?.id);
      setConnectionError(null);
      setIsConnecting(false);
      setIsConnected(true);
    });

    socketRef.current.on("connect_error", (error) => {
      console.error("❌ Connection error:", error.message);
      setConnectionError("Could not connect to server. Please refresh and try again.");
      setIsConnecting(false);
      setIsConnected(false);
    });

    socketRef.current.on("disconnect", (reason) => {
      console.log("Disconnected:", reason);
      setIsConnected(false);
      if (reason === 'io server disconnect') {
        // Server disconnected, reconnect manually
        socketRef.current?.connect();
      }
    });

    socketRef.current.on("reconnect", (attempt) => {
      console.log("Reconnected after", attempt, "attempts");
      setConnectionError(null);
      setIsConnecting(false);
      setIsConnected(true);
    });

    socketRef.current.on("reconnect_failed", () => {
      setConnectionError("Could not connect to server. Please refresh and try again.");
      setIsConnecting(false);
      setIsConnected(false);
    });
    
    return socketRef.current;
  }, []);

  // Wait for socket to be ready before emitting events
  const waitForSocket = useCallback((socket: Socket, callback: () => void, maxWait = 15000) => {
    if (socket.connected && socket.id) {
      console.log("Socket already connected:", socket.id);
      callback();
      return;
    }
    
    console.log("Waiting for socket connection...");
    const startTime = Date.now();
    const checkConnection = () => {
      if (socket.connected && socket.id) {
        console.log("Socket connected after wait:", socket.id);
        callback();
        return;
      }
      
      if (Date.now() - startTime > maxWait) {
        console.error("Timeout waiting for socket connection");
        setConnectionError("Connection timeout. Please refresh and try again.");
        setCurrentView("landing");
        return;
      }
      
      setTimeout(checkConnection, 200);
    };
    
    checkConnection();
  }, []);

  // WebRTC handlers
  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers });
    
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current?.connected) {
        socketRef.current.emit("ice-candidate", {
          sessionId: sessionData?.sessionId,
          candidate: event.candidate,
          targetId: sessionData?.partner.id,
        });
      }
    };
    
    pc.ontrack = (event) => {
      console.log("Received remote track:", event.streams[0]);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
      setIsPeerConnected(true);
    };
    
    pc.oniceconnectionstatechange = () => {
      console.log("ICE Connection State:", pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected') {
        setIsPeerConnected(true);
      }
    };
    
    peerConnectionRef.current = pc;
    return pc;
  }, []);

  const startWebRTC = useCallback(async (isInitiator: boolean) => {
    try {
      console.log("🎥 Starting WebRTC, isInitiator:", isInitiator);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      
      localStreamRef.current = stream;
      setHasLocalStream(true);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      const pc = createPeerConnection();
      
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });
      
      if (isInitiator) {
        const dataChannel = pc.createDataChannel("chat");
        dataChannelRef.current = dataChannel;
        
        dataChannel.onmessage = (event) => {
          const msg = event.data;
          setChatMessages(prev => [...prev, { sender: "Partner", text: msg }]);
        };
        
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        if (socketRef.current?.connected) {
          socketRef.current.emit("webrtc-offer", {
            sessionId: sessionData?.sessionId,
            offer: pc.localDescription,
            targetId: sessionData?.partner.id,
          });
        }
      }
    } catch (error) {
      console.error("Error starting WebRTC:", error);
    }
  }, []);

  const handleWebRTCOffer = useCallback(async (data: { offer: RTCSessionDescriptionInit; from: string }) => {
    console.log("📨 Handling WebRTC offer from:", data.from);
    
    try {
      const pc = createPeerConnection();
      
      pc.ondatachannel = (event) => {
        dataChannelRef.current = event.channel;
        event.channel.onmessage = (e) => {
          setChatMessages(prev => [...prev, { sender: "Partner", text: e.data }]);
        };
      };
      
      await pc.setRemoteDescription(data.offer);
      
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      if (socketRef.current?.connected) {
        socketRef.current.emit("webrtc-answer", {
          sessionId: sessionData?.sessionId,
          answer: pc.localDescription,
          targetId: data.from,
        });
      }
    } catch (error) {
      console.error("Error handling WebRTC offer:", error);
    }
  }, []);

  const handleWebRTCAnswer = useCallback(async (data: { answer: RTCSessionDescriptionInit; from: string }) => {
    console.log("📨 Handling WebRTC answer from:", data.from);
    
    try {
      await peerConnectionRef.current?.setRemoteDescription(data.answer);
    } catch (error) {
      console.error("Error handling WebRTC answer:", error);
    }
  }, []);

  const handleIceCandidate = useCallback(async (data: { candidate: RTCIceCandidateInit; from: string }) => {
    try {
      await peerConnectionRef.current?.addIceCandidate(data.candidate);
    } catch (error) {
      console.error("Error adding ICE candidate:", error);
    }
  }, []);

  // End session
  const endSession = useCallback(() => {
    console.log("Ending session");
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    if (socketRef.current?.connected) {
      socketRef.current.emit("end-session", { sessionId: sessionData?.sessionId });
    }
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    setSessionData(null);
    setTimeRemaining(0);
    setHasLocalStream(false);
    setIsPeerConnected(false);
    setCurrentView("landing");
    setShowCompletionModal(false);
    setChatMessages([]);
  }, [sessionData?.sessionId]);

  // Auto-connect socket on page load
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    const socket = initSocket();
    
    // If already connected, we're good
    if (socket.connected) {
      return;
    }
    
    // Otherwise wait for connection
    const checkConnection = () => {
      if (socket.connected) {
        return;
      }
      setTimeout(checkConnection, 500);
    };
    
    // Give it a moment then start checking
    setTimeout(checkConnection, 1000);
  }, [initSocket]);

  // Set up endSession ref
  useEffect(() => {
    endSessionRef.current = endSession;
  }, [endSession]);

  // Set up socket event listeners
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    const socket = initSocket();
    
    socket.on("waiting", (data: { position: number }) => {
      console.log("📍 Waiting in queue, position:", data.position);
      setSearchPosition(data.position);
    });

    socket.on("match-found", async (data: SessionData) => {
      console.log("🎉 Match found!", data);
      setSessionData(data);
      setCurrentView("session");
      setTimeRemaining(30 * 60);
      
      // Check if bot session
      if (data.isBotSession) {
        console.log("🤖 Bot session - getting local stream");
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });
          localStreamRef.current = stream;
          setHasLocalStream(true);
          
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = stream;
          }
          setIsPeerConnected(true);
          console.log("🤖 Bot session ready");
        } catch (err) {
          console.error("Error getting local stream for bot:", err);
        }
        return;
      }
      
      // Start WebRTC for real user
      await startWebRTC(data.isInitiator);
    });

    socket.on("webrtc-offer", handleWebRTCOffer);
    socket.on("webrtc-answer", handleWebRTCAnswer);
    socket.on("ice-candidate", handleIceCandidate);

    socket.on("session-ended", (data: { reason: string }) => {
      console.log("Session ended:", data.reason);
      endSession();
    });

    return () => {
      socket.off("waiting");
      socket.off("match-found");
      socket.off("webrtc-offer");
      socket.off("webrtc-answer");
      socket.off("ice-candidate");
      socket.off("session-ended");
    };
  }, [initSocket, handleWebRTCOffer, handleWebRTCAnswer, handleIceCandidate, startWebRTC, endSession]);

  // Timer
  useEffect(() => {
    if (currentView === "session" && timeRemaining > 0 && !isPaused) {
      timerRef.current = setInterval(() => {
        setTimeRemaining(prev => {
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

  // Find partner
  const findPartner = useCallback(() => {
    const socket = initSocket();
    setCurrentView("searching");
    setConnectionError(null);
    
    // Wait for socket to be ready before joining queue
    waitForSocket(socket, () => {
      // Use the socket id that was assigned on connection
      const socketId = socket.id || `temp-${Date.now()}`;
      console.log("🔍 Joining queue with socket ID:", socketId);
      socket.emit("join-queue", { id: socketId });
    }, 20000); // Increase timeout to 20 seconds
  }, [initSocket, waitForSocket]);

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

  // Toggle pause
  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev);
  }, []);

  // Send chat message
  const sendChatMessage = useCallback(() => {
    if (chatInput.trim() && dataChannelRef.current?.readyState === "open") {
      dataChannelRef.current.send(chatInput);
      setChatMessages(prev => [...prev, { sender: "You", text: chatInput }]);
      setChatInput("");
    }
  }, [chatInput]);

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'dark bg-slate-900' : 'bg-gradient-to-br from-sky-100 to-indigo-100'}`}>
      <div className="min-h-screen transition-colors duration-300">
        {/* Header */}
        <header className="p-4 flex justify-between items-center">
          <h1 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-indigo-900'}`}>
            StudyBuddy Connect 🎓
          </h1>
          <button
            onClick={toggleDarkMode}
            className={`p-2 rounded-full ${isDarkMode ? 'bg-slate-700 text-yellow-300' : 'bg-white text-indigo-600'} shadow-lg hover:scale-110 transition-transform`}
          >
            {isDarkMode ? '☀️' : '🌙'}
          </button>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-4 py-8">
          {connectionError && (
            <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
              {connectionError}
            </div>
          )}
          
          {/* Landing View */}
          {currentView === "landing" && (
            <div className="text-center py-20">
              {/* Connection Status */}
              <div className="mb-6">
                {isConnecting ? (
                  <span className="inline-flex items-center px-4 py-2 bg-yellow-100 text-yellow-800 rounded-full">
                    <span className="w-2 h-2 bg-yellow-500 rounded-full mr-2 animate-pulse"></span>
                    Connecting to server...
                  </span>
                ) : isConnected ? (
                  <span className="inline-flex items-center px-4 py-2 bg-green-100 text-green-800 rounded-full">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center px-4 py-2 bg-red-100 text-red-800 rounded-full">
                    <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                    Not connected - Click button to connect
                  </span>
                )}
              </div>
              
              <div className="mb-8">
                <span className="text-8xl">📚</span>
              </div>
              <h2 className={`text-5xl font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-indigo-900'}`}>
                Find Your Study Partner
              </h2>
              <p className={`text-xl mb-8 ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                Connect via video with fellow students for focused study sessions
              </p>
              <button
                onClick={findPartner}
                className="px-12 py-4 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-xl font-semibold rounded-full shadow-xl hover:from-indigo-600 hover:to-purple-600 hover:scale-105 transition-all duration-300"
              >
                Find a Study Partner
              </button>
              <p className={`mt-4 text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                🔒 100% Private • No Login Required • Video Sessions
              </p>
            </div>
          )}

          {/* Searching View */}
          {currentView === "searching" && (
            <div className="text-center py-20">
              <div className="mb-8">
                <div className="inline-block text-8xl animate-bounce">🔍</div>
              </div>
              <h2 className={`text-4xl font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-indigo-900'}`}>
                Finding Your Study Partner...
              </h2>
              <p className={`text-xl mb-8 ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                Position in queue: <span className="font-bold text-indigo-500">{searchPosition}</span>
              </p>
              <div className="flex justify-center gap-2 mb-8">
                <div className="w-4 h-4 bg-indigo-500 rounded-full animate-pulse"></div>
                <div className="w-4 h-4 bg-indigo-500 rounded-full animate-pulse delay-100"></div>
                <div className="w-4 h-4 bg-indigo-500 rounded-full animate-pulse delay-200"></div>
              </div>
              <button
                onClick={() => {
                  socketRef.current?.emit("leave-queue");
                  setCurrentView("landing");
                }}
                className="px-8 py-3 bg-gray-500 text-white rounded-full hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Session View */}
          {currentView === "session" && (
            <div className="max-w-6xl mx-auto">
              {/* Timer */}
              <div className="text-center mb-4">
                <span className={`text-2xl font-bold ${isPaused ? 'text-yellow-500' : isDarkMode ? 'text-white' : 'text-indigo-900'}`}>
                  ⏱️ {formatTime(timeRemaining)}
                </span>
                {isPaused && <span className="ml-2 text-yellow-500">(Paused)</span>}
              </div>

              {/* Video Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Local Video */}
                <div className="relative rounded-xl overflow-hidden shadow-2xl bg-black aspect-video">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2 left-2 bg-black/50 text-white px-2 py-1 rounded text-sm">
                    You {isCameraMuted && '📷'}
                  </div>
                </div>
                
                {/* Remote Video */}
                <div className="relative rounded-xl overflow-hidden shadow-2xl bg-black aspect-video">
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2 left-2 bg-black/50 text-white px-2 py-1 rounded text-sm">
                    Partner {sessionData?.isBotSession && '🤖'}
                  </div>
                  {!isPeerConnected && !sessionData?.isBotSession && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <p className="text-white">Connecting...</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Controls */}
              <div className="flex justify-center gap-4">
                <button
                  onClick={toggleCamera}
                  className={`p-4 rounded-full ${isCameraMuted ? 'bg-red-500' : 'bg-gray-600'} text-white hover:scale-110 transition-transform`}
                >
                  {isCameraMuted ? '📷' : '📹'}
                </button>
                <button
                  onClick={toggleMic}
                  className={`p-4 rounded-full ${isMicMuted ? 'bg-red-500' : 'bg-gray-600'} text-white hover:scale-110 transition-transform`}
                >
                  {isMicMuted ? '🔇' : '🎤'}
                </button>
                <button
                  onClick={togglePause}
                  className={`p-4 rounded-full ${isPaused ? 'bg-yellow-500' : 'bg-gray-600'} text-white hover:scale-110 transition-transform`}
                >
                  {isPaused ? '▶️' : '⏸️'}
                </button>
                <button
                  onClick={endSession}
                  className="p-4 rounded-full bg-red-500 text-white hover:scale-110 transition-transform"
                >
                  📞
                </button>
              </div>

              {/* Chat */}
              <div className="mt-4 max-w-md mx-auto">
                <div className={`rounded-xl p-4 ${isDarkMode ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
                  <h3 className={`font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Chat</h3>
                  <div 
                    ref={chatMessagesRef}
                    className="h-32 overflow-y-auto mb-2 space-y-1"
                  >
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`text-sm ${msg.sender === 'You' ? 'text-indigo-500' : isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                        <span className="font-bold">{msg.sender}:</span> {msg.text}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                      placeholder="Type a message..."
                      className={`flex-1 px-3 py-2 rounded-lg border ${isDarkMode ? 'bg-slate-700 text-white border-slate-600' : 'border-gray-300'}`}
                    />
                    <button
                      onClick={sendChatMessage}
                      className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"
                    >
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Completion Modal */}
        {showCompletionModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
            <div className={`rounded-2xl p-8 max-w-md text-center ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`}>
              <div className="text-6xl mb-4">🎉</div>
              <h2 className={`text-2xl font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                Session Complete!
              </h2>
              <p className={`mb-6 ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                Great work! You completed a focused study session.
              </p>
              <button
                onClick={endSession}
                className="px-8 py-3 bg-indigo-500 text-white rounded-full hover:bg-indigo-600 transition-colors"
              >
                Back to Home
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
