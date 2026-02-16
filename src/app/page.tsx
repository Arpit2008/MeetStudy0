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

export default function DuoStudyConnect() {
  // App states
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState(25); // Default 25 minutes
  const [studyMode, setStudyMode] = useState<"normal" | "silent">("normal");
  const [isPlayingMusic, setIsPlayingMusic] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [showIcebreaker, setShowIcebreaker] = useState(false);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  
/* eslint-disable react-hooks/set-state-in-effect */
  // Initialize dark mode and session count from localStorage after mount
  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem("studybuddy-theme");
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
      setIsDarkMode(true);
    }
    // Load session count
    const today = new Date().toDateString();
    const savedDate = localStorage.getItem("studybuddy-date");
    const savedCount = localStorage.getItem("studybuddy-sessions");
    if (savedDate === today && savedCount) {
      setSessionCount(parseInt(savedCount, 10));
    } else {
      localStorage.setItem("studybuddy-date", today);
      localStorage.setItem("studybuddy-sessions", "0");
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
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const botTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // State to track streams for useEffect
  const [localStreamForVideo, setLocalStreamForVideo] = useState<MediaStream | null>(null);
  const [remoteStreamForVideo, setRemoteStreamForVideo] = useState<MediaStream | null>(null);
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
    setTimeRemaining(selectedDuration * 60);
    setIsConnected(true);
    setIsConnecting(false);
    setShowIcebreaker(true);
    
    // Get local stream and show it only in local video
    navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    }).then(stream => {
      localStreamRef.current = stream;
      setHasLocalStream(true);
      
      // Only set local video - NOT remote video (that's the fix!)
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      // Clear remote video - show placeholder instead of self
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      remoteStreamRef.current = null;
      setRemoteStreamForVideo(null);
      
      setIsPeerConnected(true);
      console.log("🤖 Bot session ready - showing placeholder in partner video");
    }).catch(err => {
      console.error("Error getting local stream for bot:", err);
    });
  }, [selectedDuration]);

  // End session
  const endSession = useCallback(() => {
    console.log("Ending session");
    
    // Stop music if playing
    if (musicRef.current) {
      musicRef.current.pause();
      musicRef.current.currentTime = 0;
      setIsPlayingMusic(false);
    }
    
    // Increment session count
    const today = new Date().toDateString();
    const savedDate = localStorage.getItem("studybuddy-date");
    const savedCount = localStorage.getItem("studybuddy-sessions");
    
    if (savedDate === today && savedCount) {
      const newCount = parseInt(savedCount, 10) + 1;
      localStorage.setItem("studybuddy-sessions", newCount.toString());
      setSessionCount(newCount);
    }
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
    setShowIcebreaker(false);
  }, []);

  // Set up refs for callbacks
  useEffect(() => {
    endSessionRef.current = endSession;
  }, [endSession]);

  // Handle local stream → local video
  useEffect(() => {
    if (localStreamForVideo && localVideoRef.current) {
      console.log("🎥 Setting local video srcObject");
      localVideoRef.current.srcObject = localStreamForVideo;
    }
  }, [localStreamForVideo, currentView]);

  // Handle remote stream → remote video
  useEffect(() => {
    if (remoteStreamForVideo && remoteVideoRef.current) {
      console.log("🎥 Setting remote video srcObject");
      remoteVideoRef.current.srcObject = remoteStreamForVideo;
    }
  }, [remoteStreamForVideo, currentView]);

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

  // Toggle study music
  const toggleMusic = useCallback(() => {
    if (!musicRef.current) {
      // Create audio element with a LoFi music URL (free to use)
      musicRef.current = new Audio("https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3");
      musicRef.current.loop = true;
      musicRef.current.volume = 0.3;
    }
    
    if (isPlayingMusic) {
      musicRef.current.pause();
    } else {
      musicRef.current.play().catch(err => console.log("Music play error:", err));
    }
    setIsPlayingMusic(prev => !prev);
  }, [isPlayingMusic]);

  // Handle study mode change
  const handleStudyModeChange = useCallback((mode: "normal" | "silent") => {
    setStudyMode(mode);
    if (mode === "silent" && localStreamRef.current) {
      // Auto-mute mic in silent mode
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack && audioTrack.enabled) {
        audioTrack.enabled = false;
        setIsMicMuted(true);
      }
    }
  }, []);

  // Share link
  const shareLink = useCallback(() => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({
        title: "DuoStudy Connect",
        text: "Join me for a focused study session with DuoStudy Connect!",
        url: url,
      });
    } else {
      navigator.clipboard.writeText(url).then(() => {
        alert("Link copied to clipboard! Share with friends to study together.");
      });
    }
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
      
      // Listen for peer leave events - auto-reconnect to new partner
      room.onPeerLeave((peerId: string) => {
        console.log("👋 Peer left:", peerId);
        
        // Skip if it's our own ID
        const myId = getSelfId ? getSelfId() : null;
        if (myId && peerId === myId) {
          console.log("Ignoring self leave");
          return;
        }
        
        // Partner disconnected - reset state and find a new partner
        console.log("🔄 Partner disconnected, searching for new partner...");
        setIsPeerConnected(false);
        setIsConnected(false);
        
        // Clear remote stream
        remoteStreamRef.current = null;
        setRemoteStreamForVideo(null);
        
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = null;
        }
        
        // Go back to searching and find a new partner
        setCurrentView("searching");
        setSearchStatus("Partner disconnected. Finding new partner...");
        
        // Reset and search for new peer
        foundRealPeer = false;
        
        // Set new timeout to find new peer (shorter: 15 seconds)
        botTimeoutRef.current = setTimeout(() => {
          if (!foundRealPeer) {
            console.log("⏰ No new peers found after 15 seconds, starting bot session");
            setSearchStatus("No peers found. Starting practice session...");
            
            // Clean up Trystero connection
            if (roomRef.current) {
              roomRef.current.leave();
              roomRef.current = null;
            }
            
            createBotSession();
          }
        }, 15000);
      });
      
      // Listen for incoming streams
      room.onPeerStream((stream: MediaStream, peerId: string) => {
        console.log("📹 Received stream from peer:", peerId);
        console.log("Stream tracks:", stream.getTracks().length);
        
        // Store the remote stream
        remoteStreamRef.current = stream;
        setRemoteStreamForVideo(stream);
        
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          console.log("📹 Remote video srcObject set directly");
        } else {
          console.log("📹 Remote video ref not ready, will use effect");
        }
        setIsPeerConnected(true);
        setCurrentView("session");
        setIsConnected(true);
        setIsConnecting(false);
        setTimeRemaining(selectedDuration * 60);
        setShowIcebreaker(true);
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
          console.log("🎥 Got local media stream, tracks:", stream.getTracks().length);
          localStreamRef.current = stream;
          setLocalStreamForVideo(stream); // Trigger useEffect to set video
          setHasLocalStream(true);
          
          // Video will be set by useEffect
          
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
  }, [createBotSession, selectedDuration]);

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
        {/* Header - Mobile optimized */}
        <header className="p-3 sm:p-4 flex justify-between items-center sticky top-0 z-40 backdrop-blur-md">
          <h1 className={`text-lg sm:text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-indigo-900'} flex items-center gap-2`}>
            <span className="text-2xl sm:text-3xl animate-bounce-subtle">🎓</span>
            <span className="hidden sm:inline">DuoStudy Connect</span>
            <span className="sm:hidden">DuoStudy</span>
          </h1>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={shareLink}
              className={`p-2.5 sm:p-2 rounded-full ${isDarkMode ? 'bg-slate-700/80 text-white hover:bg-slate-600' : 'bg-white/80 text-indigo-600 hover:bg-indigo-50'} shadow-lg hover:scale-110 active:scale-95 transition-all duration-200 backdrop-blur`}
              title="Invite friends"
            >
              <span className="text-lg sm:text-xl">📤</span>
            </button>
            <button
              onClick={toggleDarkMode}
              className={`p-2.5 sm:p-2 rounded-full ${isDarkMode ? 'bg-slate-700/80 text-yellow-300 hover:bg-slate-600' : 'bg-white/80 text-indigo-600'} shadow-lg hover:scale-110 active:scale-95 transition-all duration-200 backdrop-blur`}
            >
              <span className="text-lg sm:text-xl">{isDarkMode ? '☀️' : '🌙'}</span>
            </button>
          </div>
        </header>

        {/* Donation Section - Top of Homepage */}
        <div className="px-3 sm:px-4 pt-4 animate-fade-in">
          <div className="max-w-2xl mx-auto bg-gradient-to-r from-sky-400 via-sky-500 to-cyan-500 rounded-2xl p-6 sm:p-8 shadow-xl shadow-sky-500/25 backdrop-blur-md border border-white/20">
            {/* Heart Animation */}
            <div className="flex justify-center mb-4">
              <span className="text-4xl sm:text-5xl animate-pulse">❤️</span>
            </div>
            
            {/* Title */}
            <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-3">
              Support This Project ❤️
            </h2>
            
            {/* Description */}
            <p className="text-white/90 text-center mb-6 text-base sm:text-lg">
              This website is completely free. You can support us by donating any amount.
            </p>
            
            {/* Donate Button */}
            <div className="flex justify-center">
              <a
                href="upi://pay?pa=itsarpita@fam&pn=Support&cu=INR"
                className="inline-block px-8 py-4 sm:px-10 sm:py-4 bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 text-white text-lg sm:text-xl font-semibold rounded-full shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-300 animate-pulse"
              >
                Donate via UPI
              </a>
            </div>
            
            {/* Note below button */}
            <p className="text-white/80 text-center mt-4 text-sm sm:text-base">
              You can donate any amount you like
            </p>
          </div>
        </div>

        {/* Main Content */}
        <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-4xl">
          {connectionError && (
            <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg animate-shake">
              {connectionError}
            </div>
          )}
          
          {/* Landing View */}
          {currentView === "landing" && (
            <div className="text-center py-8 sm:py-16 animate-fade-in">
              {/* Connection Status */}
              <div className="mb-6">
                <span className="inline-flex items-center px-3 sm:px-4 py-1.5 sm:py-2 bg-green-100/90 text-green-800 rounded-full text-sm sm:text-base backdrop-blur">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                  Ready to Connect (P2P)
                </span>
              </div>
              
              <div className="mb-6 sm:mb-8">
                <span className="text-6xl sm:text-8xl inline-block animate-float">📚</span>
              </div>
              <h2 className={`text-3xl sm:text-5xl font-bold mb-3 sm:mb-4 ${isDarkMode ? 'text-white' : 'text-indigo-900'}`}>
                Find Your Study Partner
              </h2>
              <p className={`text-base sm:text-xl mb-6 sm:mb-8 ${isDarkMode ? 'text-slate-300' : 'text-gray-600'} px-4`}>
                Connect via video with fellow students for focused study sessions
              </p>
              
              {/* Session Counter */}
              {sessionCount > 0 && (
                <div className="mb-6">
                  <span className={`inline-flex items-center px-4 py-2 rounded-full text-sm sm:text-base ${isDarkMode ? 'bg-indigo-900/80 text-indigo-200' : 'bg-indigo-100 text-indigo-800'} backdrop-blur`}>
                    🔥 You completed {sessionCount} session{sessionCount !== 1 ? 's' : ''} today!
                  </span>
                </div>
              )}
              
              {/* Timer Duration Selector - Mobile optimized */}
              <div className="mb-8 px-4">
                <p className={`mb-3 ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>Select study duration:</p>
                <div className="flex justify-center gap-2 sm:gap-3">
                  {[25, 45, 60].map((duration, idx) => (
                    <button
                      key={duration}
                      onClick={() => setSelectedDuration(duration)}
                      className={`px-5 py-3 sm:px-6 sm:py-3 rounded-full font-semibold text-base sm:text-lg transition-all duration-300 ${
                        selectedDuration === duration
                          ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white scale-105 shadow-lg shadow-indigo-500/30'
                          : `${isDarkMode ? 'bg-slate-700/80 text-slate-300 hover:bg-slate-600' : 'bg-white text-gray-700 hover:bg-gray-100'} shadow`
                      } active:scale-95`}
                      style={{ animationDelay: `${idx * 0.1}s` }}
                    >
                      {duration} min
                    </button>
                  ))}
                </div>
              </div>
              
              <button
                onClick={findPartner}
                className="px-8 py-4 sm:px-12 sm:py-4 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white text-lg sm:text-xl font-semibold rounded-2xl shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all duration-300 animate-glow"
              >
                Find a Study Partner
              </button>
              <p className={`mt-4 text-xs sm:text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-500'} px-4`}>
                🔒 100% Private • No Login Required • Video Sessions • P2P Connection
              </p>
            </div>
          )}

          {/* Searching View - Mobile optimized */}
          {currentView === "searching" && (
            <div className="text-center py-12 sm:py-20">
              <div className="mb-6 sm:mb-8">
                <div className="inline-block text-5xl sm:text-8xl animate-pulse">🔍</div>
              </div>
              <h2 className={`text-2xl sm:text-4xl font-bold mb-3 sm:mb-4 ${isDarkMode ? 'text-white' : 'text-indigo-900'}`}>
                {searchStatus}
              </h2>
              <p className={`text-base sm:text-xl mb-6 sm:mb-8 ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                Using decentralized P2P network for connection
              </p>
              <div className="flex justify-center items-center gap-2 mb-6 sm:mb-8">
                <div className="w-3 h-3 bg-indigo-500 rounded-full animate-bounce"></div>
                <div className="w-3 h-3 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-3 h-3 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
              <button
                onClick={endSession}
                className="px-6 py-3 sm:px-8 sm:py-3 bg-gray-200 text-gray-700 rounded-full hover:bg-gray-300 active:scale-95 transition-all text-base sm:text-lg"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Session View */}
          {currentView === "session" && (
            <div className="space-y-3 sm:space-y-4 animate-fade-in">
              {/* Session Header - Mobile optimized */}
              <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-3 sm:p-4 rounded-lg ${isDarkMode ? 'bg-slate-800/90' : 'bg-white/80'} backdrop-blur shadow-lg`}>
                <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
                  <span className={`text-base sm:text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-indigo-900'}`}>
                    {isBotSession ? "🤖 Practice Session" : "🎓 Study Session"}
                  </span>
                  <span className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm ${isPeerConnected ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {isPeerConnected ? "Connected" : "Connecting..."}
                  </span>
                </div>
                <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto justify-between sm:justify-end">
                  <span className={`text-lg sm:text-xl font-mono font-bold ${isDarkMode ? 'text-white' : 'text-indigo-900'}`}>
                    ⏱️ {formatTime(timeRemaining)}
                  </span>
                  <button
                    onClick={endSession}
                    className="px-4 py-2 sm:px-4 sm:py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 active:scale-95 transition-all text-sm sm:text-base"
                  >
                    End
                  </button>
                </div>
              </div>

              {/* Video Grid - Mobile optimized (stacked on mobile, side by side on desktop) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {/* Remote Video */}
                <div className={`relative rounded-xl overflow-hidden shadow-2xl ${isDarkMode ? 'bg-slate-800' : 'bg-gray-900'} aspect-video sm:aspect-video`}>
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  {!isPeerConnected && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-5xl sm:text-6xl mb-3 sm:mb-4 animate-pulse">👤</div>
                        <p className={`text-sm sm:text-lg ${isDarkMode ? 'text-slate-400' : 'text-gray-400'}`}>
                          {isBotSession ? "Your practice session" : "Waiting for partner..."}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-2 sm:bottom-4 left-2 sm:left-4 px-2 sm:px-3 py-1 bg-black/50 text-white rounded-lg text-xs sm:text-sm">
                    {isBotSession ? "You (Practice)" : "Partner"}
                  </div>
                </div>

                {/* Local Video */}
                <div className="relative rounded-xl overflow-hidden shadow-2xl bg-gray-900 aspect-video sm:aspect-video">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover mirror"
                  />
                  <div className="absolute bottom-2 sm:bottom-4 left-2 sm:left-4 px-2 sm:px-3 py-1 bg-black/50 text-white rounded-lg text-xs sm:text-sm">
                    You
                  </div>
                  {isCameraMuted && (
                    <div className="absolute top-2 sm:top-4 right-2 sm:right-4 p-2 bg-red-500 rounded-full animate-pulse">
                      <span className="text-white text-sm">📷</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Controls - Mobile optimized with larger touch targets */}
              <div className={`flex flex-wrap justify-center items-center gap-2 sm:gap-4 p-3 sm:p-4 rounded-lg ${isDarkMode ? 'bg-slate-800/90' : 'bg-white/80'} backdrop-blur shadow-lg`}>
                {/* Study Mode Toggle */}
                <button
                  onClick={() => handleStudyModeChange(studyMode === "normal" ? "silent" : "normal")}
                  className={`px-4 py-3 sm:px-4 sm:py-2 rounded-full text-sm font-semibold transition-all duration-200 active:scale-95 ${
                    studyMode === "silent" 
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30' 
                      : `${isDarkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`
                  }`}
                  title={studyMode === "silent" ? "Silent Mode (mic muted)" : "Normal Mode"}
                >
                  {studyMode === "silent" ? '🤫 Silent' : '🔊 Normal'}
                </button>
                
                {/* Mic - Larger button for mobile */}
                <button
                  onClick={toggleMic}
                  className={`p-4 sm:p-3 rounded-full transition-all duration-200 active:scale-90 ${isMicMuted ? 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30' : 'bg-gray-200 hover:bg-gray-300'} ${isDarkMode ? 'text-white' : 'text-gray-800'}`}
                  title={isMicMuted ? "Unmute" : "Mute"}
                >
                  <span className="text-xl sm:text-lg">{isMicMuted ? "🔇" : "🎤"}</span>
                </button>
                
                {/* Camera */}
                <button
                  onClick={toggleCamera}
                  className={`p-4 sm:p-3 rounded-full transition-all duration-200 active:scale-90 ${isCameraMuted ? 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30' : 'bg-gray-200 hover:bg-gray-300'} ${isDarkMode ? 'text-white' : 'text-gray-800'}`}
                  title={isCameraMuted ? "Turn on camera" : "Turn off camera"}
                >
                  <span className="text-xl sm:text-lg">{isCameraMuted ? "📷" : "📹"}</span>
                </button>
                
                {/* Music */}
                <button
                  onClick={toggleMusic}
                  className={`p-4 sm:p-3 rounded-full transition-all duration-200 active:scale-90 ${isPlayingMusic ? 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-lg shadow-indigo-500/30' : 'bg-gray-200 hover:bg-gray-300'} ${isDarkMode ? 'text-white' : 'text-gray-800'}`}
                  title={isPlayingMusic ? "Stop music" : "Play lo-fi music"}
                >
                  <span className="text-xl sm:text-lg">{isPlayingMusic ? "🎵" : "🎧"}</span>
                </button>
                
                {/* Pause */}
                <button
                  onClick={togglePause}
                  className={`p-4 sm:p-3 rounded-full transition-all duration-200 active:scale-90 ${isPaused ? 'bg-yellow-500 hover:bg-yellow-600 shadow-lg shadow-yellow-500/30' : 'bg-gray-200 hover:bg-gray-300'} ${isDarkMode ? 'text-white' : 'text-gray-800'}`}
                  title={isPaused ? "Resume" : "Pause"}
                >
                  <span className="text-xl sm:text-lg">{isPaused ? "▶️" : "⏸️"}</span>
                </button>
                
                {/* End Call */}
                <button
                  onClick={endSession}
                  className="p-4 sm:p-3 rounded-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white transition-all duration-200 active:scale-90 shadow-lg shadow-red-500/30"
                  title="End session"
                >
                  <span className="text-xl sm:text-lg">📞</span>
                </button>
              </div>

              {/* Icebreaker Message */}
              {showIcebreaker && !isBotSession && (
                <div className={`text-center p-3 sm:p-4 rounded-lg ${isDarkMode ? 'bg-indigo-900/50' : 'bg-indigo-50'} animate-pulse backdrop-blur`}>
                  <p className={`text-sm sm:text-lg font-semibold ${isDarkMode ? 'text-indigo-200' : 'text-indigo-800'}`}>
                    👋 Say hi to your study partner!
                  </p>
                  <button
                    onClick={() => setShowIcebreaker(false)}
                    className={`mt-2 text-xs sm:text-sm ${isDarkMode ? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-500'}`}
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Chat - Mobile optimized */}
              <div className={`rounded-xl p-3 sm:p-4 ${isDarkMode ? 'bg-slate-800/90' : 'bg-white/80'} backdrop-blur shadow-lg`}>
                <h3 className={`text-base sm:text-lg font-semibold mb-2 sm:mb-3 ${isDarkMode ? 'text-white' : 'text-indigo-900'}`}>
                  💬 Chat
                </h3>
                <div className={`h-40 sm:h-48 overflow-y-auto mb-3 p-3 rounded-lg ${isDarkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
                  {chatMessages.length === 0 ? (
                    <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                      No messages yet. Start the conversation!
                    </p>
                  ) : (
                    chatMessages.map((msg, idx) => (
                      <div key={idx} className={`mb-2 ${msg.sender === "You" ? 'text-right' : 'text-left'} animate-slide-up`} style={{ animationDelay: `${idx * 0.05}s` }}>
                        <span className={`inline-block px-3 py-2 rounded-lg ${msg.sender === "You" ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white' : isDarkMode ? 'bg-slate-600 text-white' : 'bg-gray-200 text-gray-800'}`}>
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
                    className={`flex-1 px-4 py-3 sm:py-2 rounded-lg border text-base sm:text-sm ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-800 placeholder-gray-500'} focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50 transition-all`}
                  />
                  <button
                    onClick={sendChatMessage}
                    className="px-5 py-3 sm:px-6 sm:py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg hover:from-indigo-600 hover:to-purple-600 active:scale-95 transition-all text-base sm:text-sm font-semibold"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Admin Details */}
          <div className={`mt-8 sm:mt-12 text-center p-4 sm:p-6 rounded-xl ${isDarkMode ? 'bg-slate-800/60' : 'bg-white/60'} backdrop-blur shadow-lg`}>
            <h3 className={`text-lg sm:text-xl font-bold mb-3 ${isDarkMode ? 'text-white' : 'text-indigo-900'}`}>
              👨‍💻 Admin Details
            </h3>
            <div className={`space-y-2 ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>
              <p className="text-base sm:text-lg font-semibold">Name: Arpit Maurya</p>
              <p className="text-base sm:text-lg">📧 Email: arpitmaurya55555@gmail.com</p>
            </div>
          </div>

          {/* Completion Modal - Mobile optimized */}
          {showCompletionModal && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
              <div className={`p-6 sm:p-8 rounded-2xl ${isDarkMode ? 'bg-slate-800' : 'bg-white'} shadow-2xl text-center animate-scale-in max-w-sm w-full`}>
                <div className="text-5xl sm:text-6xl mb-4 animate-bounce-subtle">🎉</div>
                <h2 className={`text-2xl sm:text-3xl font-bold mb-3 sm:mb-4 ${isDarkMode ? 'text-white' : 'text-indigo-900'}`}>
                  Session Complete!
                </h2>
                <p className={`text-base sm:text-lg mb-5 sm:mb-6 ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                  Great study session! Would you like to find another partner?
                </p>
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
                  <button
                    onClick={() => {
                      setShowCompletionModal(false);
                      findPartner();
                    }}
                    className="px-6 py-3 sm:px-6 sm:py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 active:scale-95 transition-all font-semibold text-base"
                  >
                    Find New Partner
                  </button>
                  <button
                    onClick={() => {
                      setShowCompletionModal(false);
                      setCurrentView("landing");
                    }}
                    className={`px-6 py-3 sm:px-6 sm:py-3 rounded-xl transition-all duration-200 active:scale-95 ${isDarkMode ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'} font-semibold text-base`}
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
