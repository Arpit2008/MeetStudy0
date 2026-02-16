"use client";

/* eslint-disable react-hooks/preserve-manual-memoization */

import { useState, useEffect, useRef, useCallback } from "react";

// Dynamic import for Trystero (only on client side)
let joinRoom: any = null;
let getSelfId: any = null;
let Room: any = null;

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

// Room and app ID for Trystero (decentralized P2P)
const ROOM_ID = "studybuddy-room-v1";
const APP_ID = "studybuddy-connect-v1";

// Trystero config - using only IPFS trackers (no Nostr relays)
// IPFS trackers are more reliable and don't have rate limiting issues
const getTrysteroConfig = () => ({
  trackerUrls: [
    "wss://peer.when.lol",
    "wss://tracker.fileshost.io",
    "wss://trystero.trackers.moe",
  ],
});

// Dynamic import Trystero on client side only
const loadTrystero = async () => {
  if (typeof window === 'undefined') return false;
  
  try {
    const trystero = await import("trystero");
    joinRoom = trystero.joinRoom;
    getSelfId = () => trystero.selfId;
    console.log("✅ Trystero loaded successfully");
    console.log("   selfId:", trystero.selfId);
    return true;
  } catch (err) {
    console.error("❌ Failed to load Trystero:", err);
    return false;
  }
};

export default function StudyBuddyConnect() {
  // App states
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [mounted, setMounted] = useState(false);
  
/* eslint-disable react-hooks/set-state-in-effect */
  // Initialize dark mode from localStorage after mount
  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem("studybuddy-theme");
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
      setIsDarkMode(true);
    }
  }, []);
/* eslint-enable react-hooks/set-state-in-effect */
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
  const roomRef = useRef<any>(null);
  const peerConnectionRef = useRef<any>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const botTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // End session
  const endSession = useCallback(() => {
    console.log("Ending session");
    
    // Clear bot timeout
    if (botTimeoutRef.current) {
      clearTimeout(botTimeoutRef.current);
      botTimeoutRef.current = null;
    }
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
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
  }, []);

  // Set up refs for callbacks
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
    if (chatInput.trim() && roomRef.current) {
      const [sendChat] = roomRef.current.makeAction("chat");
      sendChat({ sender: "You", text: chatInput });
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

  // Find partner using Trystero (P2P via BitTorrent/IPFS)
  // NOTE: This must be defined before any early returns to follow React hooks rules
  const findPartner = useCallback(async () => {
    // First load Trystero dynamically
    setCurrentView("searching");
    setConnectionError(null);
    setIsConnecting(true);
    setSearchStatus("Loading P2P library...");
    
    const loaded = await loadTrystero();
    if (!loaded) {
      setConnectionError("Failed to load P2P library. Please refresh and try again.");
      setIsConnecting(false);
      setCurrentView("landing");
      return;
    }
    
    setSearchStatus("Connecting to P2P network...");
    console.log("🔌 Connecting via Trystero (decentralized P2P)...");
    console.log("My selfId:", getSelfId());
    
    try {
      // Join Trystero room with custom trackers
      const config = getTrysteroConfig();
      const room = joinRoom({ appId: APP_ID, ...config }, ROOM_ID);
      roomRef.current = room;
      
      console.log("📡 Joined room with IPFS trackers");
      setSearchStatus("Searching for study partners...");
      
      // Create action for chat
      const [sendChat, getChat] = room.makeAction("chat");
      
      // Handle incoming chat messages
      getChat((data: any, peerId: string) => {
        console.log("💬 Chat from peer:", data);
        setChatMessages(prev => [...prev, { sender: data.sender, text: data.text }]);
      });
      
      // Track if we found a real peer
      let foundRealPeer = false;
      
      // Listen for peer join events
      room.onPeerJoin((peerId: string) => {
        console.log("👋 Peer joined:", peerId);
        
        // Skip if it's our own ID
        const myId = getSelfId ? getSelfId() : null;
        if (myId && peerId === myId) {
          console.log("Ignoring self");
          return;
        }
        
        foundRealPeer = true;
        
        // Clear bot timeout since we found a peer
        if (botTimeoutRef.current) {
          clearTimeout(botTimeoutRef.current);
          botTimeoutRef.current = null;
        }
        
        setSearchStatus("Partner found! Connecting...");
        
        // Add stream to the new peer
        if (localStreamRef.current) {
          room.addStream(localStreamRef.current, peerId);
          console.log("📤 Added stream to peer:", peerId);
        }
      });
      
      // Listen for incoming streams
      room.onPeerStream((stream: MediaStream, peerId: string) => {
        console.log("📹 Received stream from peer:", peerId);
        console.log("Stream tracks:", stream.getTracks().length);
        
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          console.log("📹 Remote video srcObject set");
        }
        setIsPeerConnected(true);
        setCurrentView("session");
        setIsConnected(true);
        setIsConnecting(false);
        setTimeRemaining(30 * 60);
      });
      
      // Set a timeout to start bot session if no peers found
      botTimeoutRef.current = setTimeout(() => {
        if (!foundRealPeer) {
          console.log("⏰ No peers found after 30 seconds, starting bot session");
          setSearchStatus("No peers found. Starting practice session...");
          
          // Clean up Trystero connection
          if (roomRef.current) {
            roomRef.current.leave();
            roomRef.current = null;
          }
          
          createBotSession();
        }
      }, 30000);
      
      // Try to get local media and add stream to room
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then((stream) => {
          localStreamRef.current = stream;
          setHasLocalStream(true);
          
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
          
          // Add stream to room (automatically shares with peers)
          room.addStream(stream);
          console.log("📤 Added local stream to room");
        })
        .catch(err => {
          console.error("Error getting media devices:", err);
          setConnectionError("Could not access camera/microphone. Please check permissions.");
        });
        
    } catch (error) {
      console.error("Error connecting via Trystero:", error);
      setConnectionError("Could not connect. Please try again.");
      setIsConnecting(false);
      setCurrentView("landing");
    }
  }, [createBotSession]);

  // Don't render content until mounted to avoid hydration mismatch
  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-100 to-indigo-100">
        <div className="min-h-screen" />
      </div>
    );
  }

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
                <div className="inline-block text-8xl animate-pulse">🔍</div>
              </div>
              <h2 className={`text-4xl font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-indigo-900'}`}>
                {searchStatus}
              </h2>
              <p className={`text-xl mb-8 ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                Using decentralized P2P network for connection
              </p>
              <div className="flex justify-center items-center gap-2 mb-8">
                <div className="w-3 h-3 bg-indigo-500 rounded-full animate-bounce"></div>
                <div className="w-3 h-3 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-3 h-3 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
              <button
                onClick={endSession}
                className="px-8 py-3 bg-gray-200 text-gray-700 rounded-full hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Session View */}
          {currentView === "session" && (
            <div className="space-y-4">
              {/* Session Header */}
              <div className={`flex justify-between items-center p-4 rounded-lg ${isDarkMode ? 'bg-slate-800' : 'bg-white/80'} backdrop-blur shadow-lg`}>
                <div className="flex items-center gap-4">
                  <span className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-indigo-900'}`}>
                    {isBotSession ? "🤖 Practice Session" : "🎓 Study Session"}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-sm ${isPeerConnected ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {isPeerConnected ? "Connected" : "Connecting..."}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-xl font-mono ${isDarkMode ? 'text-white' : 'text-indigo-900'}`}>
                    ⏱️ {formatTime(timeRemaining)}
                  </span>
                  <button
                    onClick={endSession}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                  >
                    End Session
                  </button>
                </div>
              </div>

              {/* Video Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Remote Video */}
                <div className={`relative rounded-xl overflow-hidden shadow-2xl ${isDarkMode ? 'bg-slate-800' : 'bg-gray-900'}`}>
                  {isPeerConnected ? (
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      className="w-full aspect-video object-cover"
                    />
                  ) : (
                    <div className="w-full aspect-video flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-6xl mb-4 animate-pulse">👤</div>
                        <p className={`text-lg ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>
                          {isBotSession ? "Your practice session" : "Waiting for partner..."}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-4 left-4 px-3 py-1 bg-black/50 text-white rounded-lg text-sm">
                    {isBotSession ? "You (Practice)" : "Partner"}
                  </div>
                </div>

                {/* Local Video */}
                <div className="relative rounded-xl overflow-hidden shadow-2xl bg-gray-900">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full aspect-video object-cover"
                  />
                  <div className="absolute bottom-4 left-4 px-3 py-1 bg-black/50 text-white rounded-lg text-sm">
                    You
                  </div>
                  {isCameraMuted && (
                    <div className="absolute top-4 right-4 p-2 bg-red-500 rounded-full">
                      <span className="text-white">📷</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Controls */}
              <div className={`flex justify-center items-center gap-4 p-4 rounded-lg ${isDarkMode ? 'bg-slate-800' : 'bg-white/80'} backdrop-blur shadow-lg`}>
                <button
                  onClick={toggleMic}
                  className={`p-4 rounded-full transition-colors ${isMicMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-200 hover:bg-gray-300'} ${isDarkMode ? 'text-white' : 'text-gray-800'}`}
                  title={isMicMuted ? "Unmute" : "Mute"}
                >
                  {isMicMuted ? "🔇" : "🎤"}
                </button>
                <button
                  onClick={toggleCamera}
                  className={`p-4 rounded-full transition-colors ${isCameraMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-200 hover:bg-gray-300'} ${isDarkMode ? 'text-white' : 'text-gray-800'}`}
                  title={isCameraMuted ? "Turn on camera" : "Turn off camera"}
                >
                  {isCameraMuted ? "📷" : "📹"}
                </button>
                <button
                  onClick={togglePause}
                  className={`p-4 rounded-full transition-colors ${isPaused ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-gray-200 hover:bg-gray-300'} ${isDarkMode ? 'text-white' : 'text-gray-800'}`}
                  title={isPaused ? "Resume" : "Pause"}
                >
                  {isPaused ? "▶️" : "⏸️"}
                </button>
                <button
                  onClick={endSession}
                  className="p-4 rounded-full bg-red-500 hover:bg-red-600 text-white transition-colors"
                  title="End session"
                >
                  📞
                </button>
              </div>

              {/* Chat */}
              <div className={`rounded-xl p-4 ${isDarkMode ? 'bg-slate-800' : 'bg-white/80'} backdrop-blur shadow-lg`}>
                <h3 className={`text-lg font-semibold mb-3 ${isDarkMode ? 'text-white' : 'text-indigo-900'}`}>
                  💬 Chat
                </h3>
                <div className={`h-48 overflow-y-auto mb-3 p-3 rounded-lg ${isDarkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
                  {chatMessages.length === 0 ? (
                    <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                      No messages yet. Start the conversation!
                    </p>
                  ) : (
                    chatMessages.map((msg, idx) => (
                      <div key={idx} className={`mb-2 ${msg.sender === "You" ? 'text-right' : 'text-left'}`}>
                        <span className={`inline-block px-3 py-1 rounded-lg ${msg.sender === "You" ? 'bg-indigo-500 text-white' : isDarkMode ? 'bg-slate-600 text-white' : 'bg-gray-200 text-gray-800'}`}>
                          <span className="text-xs opacity-70 block">{msg.sender}</span>
                          {msg.text}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && sendChatMessage()}
                    placeholder="Type a message..."
                    className={`flex-1 px-4 py-2 rounded-lg border ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-800'} focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                  />
                  <button
                    onClick={sendChatMessage}
                    className="px-6 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Completion Modal */}
          {showCompletionModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className={`p-8 rounded-xl ${isDarkMode ? 'bg-slate-800' : 'bg-white'} shadow-2xl text-center`}>
                <div className="text-6xl mb-4">🎉</div>
                <h2 className={`text-3xl font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-indigo-900'}`}>
                  Session Complete!
                </h2>
                <p className={`text-lg mb-6 ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                  Great study session! Would you like to find another partner?
                </p>
                <div className="flex gap-4 justify-center">
                  <button
                    onClick={() => {
                      setShowCompletionModal(false);
                      findPartner();
                    }}
                    className="px-6 py-3 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
                  >
                    Find New Partner
                  </button>
                  <button
                    onClick={() => {
                      setShowCompletionModal(false);
                      setCurrentView("landing");
                    }}
                    className={`px-6 py-3 rounded-lg transition-colors ${isDarkMode ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
                  >
                    Go to Home
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
