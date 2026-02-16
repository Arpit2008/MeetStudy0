"use client";

/* eslint-disable react-hooks/preserve-manual-memoization */

import { useState, useEffect, useRef, useCallback } from "react";
import { joinRoom, selfId } from "trystero/torrent";

// Types
interface SessionData {
  sessionId: string;
  partnerId: string;
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

// Room configuration
const APP_ID = "studybuddy_connect_v1";

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
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [hasLocalStream, setHasLocalStream] = useState(false);
  const [isPeerConnected, setIsPeerConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [searchStatus, setSearchStatus] = useState("Looking for study partners...");
  
  // Refs
  const roomRef = useRef<ReturnType<typeof joinRoom> | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const [chatMessages, setChatMessages] = useState<{ sender: string; text: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isBotSession, setIsBotSession] = useState(false);

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

  // Create bot session (for when no peers are found)
  const createBotSession = useCallback(() => {
    console.log("🤖 Creating bot session...");
    setIsBotSession(true);
    setCurrentView("session");
    setTimeRemaining(30 * 60);
    setIsConnected(true);
    setIsConnecting(false);
    
    // Get local stream and show it in both videos (simulating partner)
    navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    }).then(stream => {
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
    }).catch(err => {
      console.error("Error getting local stream for bot:", err);
    });
  }, []);

  // Find partner using Trystero
  const findPartner = useCallback(() => {
    setCurrentView("searching");
    setConnectionError(null);
    setIsConnecting(true);
    setSearchStatus("Looking for study partners...");
    
    // Generate a random room ID for matching
    const roomId = `study_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log("🔍 Joining Trystero room:", roomId);
    console.log("My ID:", selfId);
    
    try {
      const room = joinRoom({ appId: APP_ID }, roomId);
      roomRef.current = room;
      
      // Listen for peers joining
      room.onPeerJoin((peerId) => {
        console.log("👋 Peer joined:", peerId);
        setSearchStatus("Partner found! Connecting...");
        setIsConnecting(false);
        setIsConnected(true);
        
        // Create session
        setSessionData({
          sessionId: roomId,
          partnerId: peerId
        });
        
        // Get local stream and send to peer
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
          .then(stream => {
            localStreamRef.current = stream;
            setHasLocalStream(true);
            
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = stream;
            }
            
            // Add stream to room (sends to all peers)
            room.addStream(stream);
            console.log("📹 Local stream added to room");
          })
          .catch(err => {
            console.error("Error getting media devices:", err);
          });
      });
      
      // Listen for peers leaving
      room.onPeerLeave((peerId) => {
        console.log("👋 Peer left:", peerId);
        // Use ref to call endSession
        if (sessionData?.partnerId === peerId) {
          endSessionRef.current();
        }
      });
      
      // Listen for peer streams
      room.onPeerStream((stream, peerId) => {
        console.log("📹 Received stream from peer:", peerId);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
        setIsPeerConnected(true);
      });
      
      // Create chat action
      const [sendMessage, getMessage] = room.makeAction("chat");
      getMessage((data: any, peerId: string) => {
        setChatMessages(prev => [...prev, { sender: "Partner", text: String(data) }]);
      });
      
      // Store send function for later use
      (window as any).__chatSend = sendMessage;
      
      // Show searching status after a delay
      setTimeout(() => {
        if (!sessionData && currentView === "searching") {
          setSearchStatus("No partners found yet. Keep waiting...");
        }
      }, 3000);
      
      // Timeout - create bot session after 15 seconds if no peer found
      setTimeout(() => {
        if (!sessionData && currentView === "searching") {
          console.log("⏰ Timeout - creating bot session");
          room.leave();
          createBotSession();
        }
      }, 15000);
      
    } catch (error) {
      console.error("Error joining Trystero room:", error);
      setConnectionError("Could not connect. Please try again.");
      setIsConnecting(false);
      setCurrentView("landing");
    }
  }, [sessionData, currentView, createBotSession]);

  // End session
  const endSession = useCallback(() => {
    console.log("Ending session");
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    
    if (roomRef.current) {
      roomRef.current.leave();
      roomRef.current = null;
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
    setIsBotSession(false);
    setIsConnected(false);
    
    delete (window as any).__chatSend;
  }, []);

  // Set up endSession ref
  useEffect(() => {
    endSessionRef.current = endSession;
  }, [endSession]);

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
    const sendFn = (window as any).__chatSend;
    if (chatInput.trim() && sendFn) {
      sendFn(chatInput); // Sends to all peers
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
                <span className="inline-flex items-center px-4 py-2 bg-green-100 text-green-800 rounded-full">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                  Ready to Connect (P2P)
                </span>
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
                🔒 100% Private • No Login Required • Video Sessions • P2P Connection
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
                {searchStatus}
              </p>
              <div className="flex justify-center gap-2 mb-8">
                <div className="w-4 h-4 bg-indigo-500 rounded-full animate-pulse"></div>
                <div className="w-4 h-4 bg-indigo-500 rounded-full animate-pulse delay-100"></div>
                <div className="w-4 h-4 bg-indigo-500 rounded-full animate-pulse delay-200"></div>
              </div>
              <button
                onClick={endSession}
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
                    Partner {isBotSession && '🤖'}
                  </div>
                  {!isPeerConnected && !isBotSession && (
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
                      className={`flex-1 px-3 py-2 rounded-lg border ${isDarkMode ? 'bg-slate-700 text-white border-slate-600' : 'bg-gray-50 text-gray-800 border-gray-300'}`}
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

          {/* Completion Modal */}
          {showCompletionModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className={`p-8 rounded-2xl ${isDarkMode ? 'bg-slate-800' : 'bg-white'} shadow-2xl text-center`}>
                <div className="text-6xl mb-4">🎉</div>
                <h2 className={`text-2xl font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                  Session Complete!
                </h2>
                <p className={`mb-6 ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                  Great job! You completed your study session.
                </p>
                <button
                  onClick={() => setShowCompletionModal(false)}
                  className="px-8 py-3 bg-indigo-500 text-white rounded-full hover:bg-indigo-600"
                >
                  Find Another Partner
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
