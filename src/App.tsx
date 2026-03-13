import React, { useState, useEffect, useRef } from "react";
import { 
  APIProvider, 
  Map, 
  useMap
} from "@vis.gl/react-google-maps";
import { useQueryClient } from "@tanstack/react-query";
import { collection, onSnapshot, addDoc, updateDoc, doc, increment, setDoc, getDoc } from "firebase/firestore";
import {
  getAuth,
  signInWithEmailAndPassword,
  signInAnonymously,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";
import { GoogleGenAI, Type } from "@google/genai";
import { 
  AlertTriangle, 
  Flame, 
  Droplets, 
  Plus, 
  X, 
  Navigation, 
  Camera, 
  CheckCircle2,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Globe,
  Map as MapIcon,
  ShieldCheck,
  Stethoscope,
  Home,
  ShoppingBag,
  Radio,
  BarChart3,
  Eye,
  Trash2,
  Send
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Event {
  id: string;
  type: string;
  description: string;
  location: {
    lat: number;
    lng: number;
  };
  status: string;
  timestamp: number;
  imageUrl?: string;
  base64Image?: string;
  link?: string;
  priceData?: {
    item: string;
    price: string;
    unit: string;
  };
  votes?: {
    up: number;
    down: number;
  };
}

const EVENT_TYPES = [
  { id: "fire", label: "Fire", icon: Flame, color: "text-orange-500", bg: "bg-orange-50", pinColor: "#f97316" },
  { id: "flood", label: "Flood", icon: Droplets, color: "text-blue-500", bg: "bg-blue-50", pinColor: "#3b82f6" },
  { id: "hazard", label: "Hazard", icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-50", pinColor: "#f59e0b" },
  { id: "medical", label: "Medical", icon: Stethoscope, color: "text-rose-500", bg: "bg-rose-50", pinColor: "#e11d48" },
  { id: "shelter", label: "Shelter", icon: Home, color: "text-emerald-500", bg: "bg-emerald-50", pinColor: "#10b981" },
  { id: "market", label: "Market/Price", icon: ShoppingBag, color: "text-indigo-500", bg: "bg-indigo-50", pinColor: "#6366f1" },
  { id: "roadblock", label: "Road Block", icon: ShieldCheck, color: "text-slate-500", bg: "bg-slate-50", pinColor: "#64748b" },
];

function MapBridge({ onMap }: { onMap: (map: google.maps.Map | null) => void }) {
  const map = useMap();
  useEffect(() => {
    onMap(map ?? null);
  }, [map, onMap]);
  return null;
}

function PlainMarkers({
  events,
  userLocation,
  selectedEvent,
  onSelectEvent,
}: {
  events: Event[];
  userLocation: { lat: number; lng: number } | null;
  selectedEvent: Event | null;
  onSelectEvent: (e: Event | null) => void;
}) {
  const map = useMap();
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  useEffect(() => {
    if (!map) return;
    const g = (window as any).google as typeof google | undefined;
    if (!g?.maps?.Marker) return;

    const markers: google.maps.Marker[] = [];

    if (userLocation) {
      markers.push(
        new g.maps.Marker({
          map,
          position: userLocation,
          title: "Your location",
          clickable: false,
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: "#3b82f6",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        })
      );
    }

    for (const event of events.filter((e) => e.status !== "deleted")) {
      const pinColor =
        EVENT_TYPES.find((t) => t.id === event.type)?.pinColor || "#ef4444";

      const marker = new g.maps.Marker({
        map,
        position: event.location,
        title: event.type,
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: pinColor,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });

      marker.addListener("click", () => onSelectEvent(event));
      markers.push(marker);
    }

    return () => {
      for (const m of markers) {
        g.maps.event.clearInstanceListeners(m);
        m.setMap(null);
      }
    };
  }, [events, map, onSelectEvent, userLocation]);

  useEffect(() => {
    if (!map) return;
    const g = (window as any).google as typeof google | undefined;
    if (!g?.maps?.InfoWindow) return;

    if (!infoWindowRef.current) {
      infoWindowRef.current = new g.maps.InfoWindow();
    }

    if (!selectedEvent) {
      infoWindowRef.current.close();
      return;
    }

    const typeMeta = EVENT_TYPES.find((t) => t.id === selectedEvent.type);
    const content = document.createElement("div");
    content.className = "p-2 max-w-[240px]";
    content.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <div style="font-weight:800;text-transform:capitalize;color:#0f172a;">${selectedEvent.type}</div>
      </div>
      <div style="font-size:12px;line-height:1.4;color:#475569;margin-bottom:8px;">
        ${String(selectedEvent.description ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:${
          selectedEvent.status === "active" ? "#e11d48" : "#059669"
        };">
          ${selectedEvent.status}
        </div>
        <div style="font-size:10px;color:#94a3b8;">${format(
          selectedEvent.timestamp,
          "h:mm a"
        )}</div>
      </div>
    `;

    // Close handler
    infoWindowRef.current.addListener("closeclick", () => onSelectEvent(null));
    infoWindowRef.current.setContent(content);
    infoWindowRef.current.setPosition(selectedEvent.location);
    infoWindowRef.current.open({ map });
  }, [map, onSelectEvent, selectedEvent]);

  return null;
}

function AdminJsonBulkInsert({
  onSubmit,
}: {
  onSubmit: (payload: unknown) => void;
}) {
  const [text, setText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  return (
    <div className="bg-slate-50 border border-slate-100 rounded-[2rem] p-6">
      <h3 className="font-black text-slate-900 mb-2">Bulk Insert (JSON Array)</h3>
      <p className="text-xs text-slate-500 mb-4">
        Paste an array matching the required schema. This will validate server-side and insert new events.
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setParseError(null);
        }}
        rows={8}
        className="w-full px-4 py-3 rounded-2xl border border-slate-200 outline-none focus:ring-2 focus:ring-slate-500 font-mono text-xs"
        placeholder='[{"description":"...","location":{"lat":0,"lng":0},"status":"active","timestamp":0,"type":"earthquake","link":"https://..."}]'
      />
      {parseError && <p className="text-xs text-rose-600 mt-2 font-semibold">{parseError}</p>}
      <div className="mt-4 flex items-center justify-end gap-3">
        <button
          onClick={() => {
            try {
              const payload = JSON.parse(text);
              onSubmit(payload);
            } catch {
              setParseError("Invalid JSON. Please paste a valid JSON array.");
            }
          }}
          className="bg-slate-900 text-white px-5 py-3 rounded-2xl font-black hover:bg-slate-800 transition-all"
        >
          Upload JSON
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const auth = getAuth();
  const queryClient = useQueryClient();

  // === ALL HOOKS MUST BE DECLARED AT THE TOP ===
  const [events, setEvents] = useState<Event[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [adminToken, setAdminToken] = useState<string>(() => localStorage.getItem("adminToken") || "");
  const [view, setView] = useState<"landing" | "map" | "report" | "admin" | "nearby" | "radio">(() => {
    if (window.location.pathname === "/admin") return "admin";
    return "landing";
  });
useEffect(() => {
  const handlePopState = () => {
    const currentPath = window.location.pathname;
    if (currentPath === "/admin") {
      setView("admin");
    } else {
      setView("landing");
    }
  };

  window.addEventListener("popstate", handlePopState);
  return () => window.removeEventListener("popstate", handlePopState);
}, []);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [adminAuthLoading, setAdminAuthLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [radioFeeds, setRadioFeeds] = useState<any[]>([]);
  const [isRadioLoading, setIsRadioLoading] = useState(false);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [reportData, setReportData] = useState({
    type: "hazard",
    description: "",
    image: null as File | null,
    priceItem: "",
    priceValue: "",
    priceUnit: "kg"
  });

  // Fetch user location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => console.error("Error getting location:", error)
      );
    }
  }, []);

  // Real-time Firestore listener
  useEffect(() => {
    if (!import.meta.env.VITE_FIREBASE_API_KEY || !import.meta.env.VITE_FIREBASE_PROJECT_ID) {
      setError("Firebase configuration is missing. Please set your environment variables.");
      setLoading(false);
      return;
    }

    const q = collection(db, "results");
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as any),
        })) as Event[];
        setEvents(data);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("Firestore connection error:", err);
        setError("Could not connect to the event database. Operating in offline mode.");
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAdmin(!!user);
    });
    return () => unsubscribe();
  }, [auth]);

  useEffect(() => {
    localStorage.setItem("adminToken", adminToken);
  }, [adminToken]);

  useEffect(() => {
    const handlePopState = () => {
      if (window.location.pathname === "/admin") {
        setView("admin");
      } else {
        setView("landing");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Handlers & Helpers
  const handleAdminLogin = async () => {
    if (!adminEmail || !adminPass) {
      alert("Enter your email and password.");
      return;
    }
    try {
      setAdminAuthLoading(true);
      await signInWithEmailAndPassword(auth, adminEmail, adminPass);
    } catch (error: any) {
      console.error("Admin login error:", error);
      alert(error?.message || "Failed to sign in.");
    } finally {
      setAdminAuthLoading(false);
    }
  };

  const handleAdminLogout = async () => {
    try {
      await signOut(auth);
      setAdminEmail("");
      setAdminPass("");
    } catch (error) {
      console.error("Logout error:", error);
      alert("Failed to sign out.");
    }
  };

  const getLocalVoterKey = () => {
    const keyName = "event_response_voter_key";
    let key = localStorage.getItem(keyName);
    if (!key) {
      key = crypto.randomUUID();
      localStorage.setItem(keyName, key);
    }
    return key;
  };

  const handleUpdateStatus = async (
    id: string,
    status: "active" | "responded" | "past" | "false" | "deleted"
  ) => {
    try {
      const eventRef = doc(db, "results", id);
      await updateDoc(eventRef, { status });
      alert(`Event marked as ${status}.`);
    } catch (err) {
      console.error("Status update error:", err);
      alert("Failed to update status.");
    }
  };

  const handleVote = async (eventId: string, value: 1 | -1) => {
    const voterKey = getLocalVoterKey();
    const authInstance = getAuth();
  
    const currentEvent = events.find((e) => e.id === eventId);
    if (!currentEvent) return;
  
    const currentVotes = {
      up: Math.max(0, currentEvent.votes?.up ?? 0),
      down: Math.max(0, currentEvent.votes?.down ?? 0),
    };
  
    try {
      if (!authInstance.currentUser) {
        await signInAnonymously(authInstance);
      }
  
      const voteRef = doc(db, "results", eventId, "votes", voterKey);
      const eventRef = doc(db, "results", eventId);
  
      const existingVoteSnap = await getDoc(voteRef);
      const existingValue = existingVoteSnap.exists()
        ? existingVoteSnap.data().value
        : null;
  
      if (existingValue === value) return;
  
      let nextUp = currentVotes.up;
      let nextDown = currentVotes.down;
  
      if (existingValue === null) {
        if (value === 1) nextUp += 1;
        else nextDown += 1;
      } else if (existingValue === 1 && value === -1) {
        nextUp = Math.max(0, nextUp - 1);
        nextDown += 1;
      } else if (existingValue === -1 && value === 1) {
        nextDown = Math.max(0, nextDown - 1);
        nextUp += 1;
      }
  
      nextUp = Math.max(0, nextUp);
      nextDown = Math.max(0, nextDown);
  
      // optimistic UI update
      setEvents((prev) =>
        prev.map((event) =>
          event.id === eventId
            ? {
                ...event,
                votes: {
                  up: nextUp,
                  down: nextDown,
                },
              }
            : event
        )
      );
  
      if (selectedEvent?.id === eventId) {
        setSelectedEvent((prev) =>
          prev
            ? {
                ...prev,
                votes: {
                  up: nextUp,
                  down: nextDown,
                },
              }
            : prev
        );
      }
  
      if (existingValue === null) {
        await setDoc(voteRef, {
          value,
          createdAt: Date.now(),
        });
  
        await updateDoc(eventRef, {
          "votes.up": nextUp,
          "votes.down": nextDown,
        });
  
        return;
      }
  
      await setDoc(
        voteRef,
        {
          value,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
  
      await updateDoc(eventRef, {
        "votes.up": nextUp,
        "votes.down": nextDown,
      });
    } catch (error) {
      console.error("Vote error:", error);
  
      // rollback from firestore snapshot later, or manually revert now
      setEvents((prev) =>
        prev.map((event) =>
          event.id === eventId
            ? {
                ...event,
                votes: currentVotes,
              }
            : event
        )
      );
  
      if (selectedEvent?.id === eventId) {
        setSelectedEvent((prev) =>
          prev
            ? {
                ...prev,
                votes: currentVotes,
              }
            : prev
        );
      }
  
      alert("Failed to submit vote.");
    }
  };

  const navigate = (newView: typeof view) => {
    setView(newView);
    const path = newView === "admin" ? "/admin" : "/";
    window.history.pushState({}, "", path);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; 
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userLocation) {
      alert("Location access required to report.");
      return;
    }
    setSubmitting(true);

    try {
      let imageUrl = "";
      let base64Image = "";
      
      if (reportData.image) {
        base64Image = await fileToBase64(reportData.image);
        const storageRef = ref(storage, `events/${Date.now()}_${reportData.image.name}`);
        const snapshot = await uploadBytes(storageRef, reportData.image);
        imageUrl = await getDownloadURL(snapshot.ref);
      }

      const eventData: any = {
        type: reportData.type,
        description: reportData.description,
        location: userLocation,
        imageUrl,
        base64Image,
        status: "active",
        timestamp: Date.now(),
      };

      if (reportData.type === "market") {
        eventData.priceData = {
          item: reportData.priceItem,
          price: reportData.priceValue,
          unit: reportData.priceUnit
        };
      }

      await addDoc(collection(db, "results"), eventData);
      navigate("map");
      setReportData({ 
        type: "hazard", 
        description: "", 
        image: null,
        priceItem: "",
        priceValue: "",
        priceUnit: "kg"
      });
    } catch (error) {
      console.error("Error submitting report:", error);
      alert("Failed to submit report.");
    } finally {
      setSubmitting(false);
    }
  };

  const fetchRadioFeeds = async () => {
    setIsRadioLoading(true);
    try {
      let countryCode = "";
      let locationName = "Global";
      
      if (userLocation) {
        try {
          const geoRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${userLocation.lat}&longitude=${userLocation.lng}&localityLanguage=en`);
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            countryCode = geoData.countryCode || "";
            locationName = geoData.countryName || geoData.principalSubdivision || "Global";
          }
        } catch (geoErr) {
          console.error("Geocoding error:", geoErr);
        }
      }

      let aiSuggestedNames: string[] = [];
      try {
        const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
        const aiResponse = await ai.models.generateContent({
          model: "gemini-3.1-flash-lite-preview",
          contents: `Suggest 5 major news, emergency, or public service radio station names for ${locationName} (Country Code: ${countryCode || 'Unknown'}). Return only the names as a JSON array of strings.`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        });
        aiSuggestedNames = JSON.parse(aiResponse.text);
      } catch (aiErr) {
        console.error("AI suggestion error:", aiErr);
      }

      const baseUrl = 'https://de1.api.radio-browser.info/json/stations/search?limit=30&hidebroken=true&order=clickcount&reverse=true';
      let allStations: any[] = [];

      if (aiSuggestedNames.length > 0) {
        const aiStationPromises = aiSuggestedNames.map(name => 
          fetch(`https://de1.api.radio-browser.info/json/stations/byname/${encodeURIComponent(name)}?limit=1`)
            .then(res => res.ok ? res.json() : [])
            .catch(() => [])
        );
        const aiResults = await Promise.all(aiStationPromises);
        allStations = aiResults.flat();
      }

      const searchUrl = countryCode 
        ? `${baseUrl}&countrycode=${countryCode}&tag=news,official,emergency` 
        : `${baseUrl}&tag=news,official,emergency`;
      
      const response = await fetch(searchUrl);
      if (response.ok) {
        const generalData = await response.json();
        const existingIds = new Set(allStations.map(s => s.stationuuid));
        generalData.forEach((s: any) => {
          if (!existingIds.has(s.stationuuid)) {
            allStations.push(s);
          }
        });
      }
      
      if (allStations.length === 0) {
        const fallbackRes = await fetch(`${baseUrl}&tag=news`);
        allStations = await fallbackRes.json();
      }

      const formattedFeeds = allStations.map((station: any) => ({
        name: station.name,
        frequency: station.tags.split(',')[0] || "Live",
        description: `${station.country} - ${station.state || 'Global'}`,
        url: station.url_resolved || station.url,
        favicon: station.favicon,
        tags: station.tags,
        isRadioplayer: station.tags.toLowerCase().includes("official") || aiSuggestedNames.some(n => station.name.includes(n))
      }));
      
      setRadioFeeds(formattedFeeds);
    } catch (err) {
      console.error("Radio fetch error:", err);
      setRadioFeeds([
        { name: "BBC World Service", frequency: "News", description: "International news, analysis and information.", url: "https://stream.live.vc.bbcmedia.co.uk/bbc_world_service", isRadioplayer: true },
        { name: "NPR News", frequency: "Public", description: "National Public Radio news stream.", url: "https://npr-ice.streamguys1.com/live.mp3", isRadioplayer: true },
        { name: "Vatican Radio", frequency: "Global", description: "Multilingual news from the Vatican.", url: "https://shoutcast.vaticannews.va/vaticannews-1", isRadioplayer: false },
        { name: "Al Jazeera English", frequency: "News", description: "Global news and current affairs.", url: "https://live-hls-web-aje.getaj.net/AJE/index.m3u8", isRadioplayer: true },
        { name: "France 24 English", frequency: "News", description: "International news from a French perspective.", url: "https://static.france24.com/live/F24_EN_LO_HLS/live_web.m3u8", isRadioplayer: true }
      ]);
    } finally {
      setIsRadioLoading(false);
    }
  };

  const togglePlayback = async (url: string) => {
    if (!audioRef.current) return;
    if (playingUrl === url) {
      audioRef.current.pause();
      setPlayingUrl(null);
    } else {
      try {
        audioRef.current.pause();
        setPlayingUrl(url);
        audioRef.current.src = url;
        audioRef.current.load();
        await audioRef.current.play();
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          console.error("Playback error:", e);
          alert("This stream cannot be played directly in the browser due to CORS or format restrictions.");
          setPlayingUrl(null);
        }
      }
    }
  };

  const handleDeleteEvent = async (id: string) => {
    try {
      const eventRef = doc(db, "results", id);
      await updateDoc(eventRef, { status: "deleted" });
      alert("Event marked as deleted.");
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  if (!import.meta.env.VITE_GOOGLE_MAPS_API_KEY) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-8 text-center">
        <div className="max-w-md bg-white p-8 rounded-3xl shadow-2xl">
          <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-4">Configuration Required</h1>
          <p className="text-slate-600 mb-6">
            Please set your <strong>VITE_GOOGLE_MAPS_API_KEY</strong> and Firebase environment variables in the settings.
          </p>
          <div className="text-left bg-slate-50 p-4 rounded-xl text-sm font-mono text-slate-500 overflow-x-auto">
            VITE_GOOGLE_MAPS_API_KEY=your_key<br/>
            VITE_FIREBASE_API_KEY=your_key<br/>
            ...
          </div>
        </div>
      </div>
    );
  }

  if (view === "landing") {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col md:flex-row relative overflow-hidden">
        {/* Left Pane - Branding & Stats */}
        <div className="w-full md:w-1/2 p-8 md:p-16 flex flex-col justify-between relative z-10 border-b md:border-b-0 md:border-r border-white/5">
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-30">
            <div className="absolute top-[-10%] left-[-10%] w-[80%] h-[80%] bg-rose-600/20 blur-[150px] rounded-full" />
          </div>

          <div>
            <div className="w-16 h-16 bg-rose-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-rose-900/40 mb-12">
              <AlertTriangle className="text-white w-8 h-8" />
            </div>
            
            <h1 className="text-7xl md:text-9xl font-black text-white mb-8 tracking-tighter leading-[0.85]">
              EVENT<br/>
              <span className="text-rose-600">RESPONSE</span>
            </h1>
            
            <p className="text-xl text-slate-400 leading-relaxed max-w-md mb-12">
              A real-time command center for community safety, incident mapping, and coordinated emergency response.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-3 gap-8 pt-12 border-t border-white/5">
            <div>
              <p className="text-4xl font-bold text-white mb-1">{events.length}</p>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-[0.2em]">Incidents</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-emerald-500 mb-1">{events.filter(i => i.status === 'responded').length}</p>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-[0.2em]">Resolved</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-rose-500 mb-1">{events.filter(i => i.status === 'active').length}</p>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-[0.2em]">Critical</p>
            </div>
          </div>
        </div>

        {/* Right Pane - Actions */}
        <div className="w-full md:w-1/2 p-8 md:p-16 flex flex-col justify-center bg-slate-900/30 backdrop-blur-sm relative z-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button 
              onClick={() => navigate("map")}
              className="group bg-white/5 border border-white/10 p-8 rounded-[2rem] flex flex-col items-start gap-6 hover:bg-white/10 transition-all active:scale-[0.98] text-left"
            >
              <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                <MapIcon className="w-7 h-7 text-slate-900" />
              </div>
              <div>
                <span className="text-white font-bold text-xl block mb-1">Incident Map</span>
                <p className="text-slate-500 text-sm leading-snug">Real-time situational awareness and event tracking.</p>
              </div>
            </button>

            <button 
              onClick={() => navigate("report")}
              className="group bg-rose-600/10 border border-rose-600/20 p-8 rounded-[2rem] flex flex-col items-start gap-6 hover:bg-rose-600/20 transition-all active:scale-[0.98] text-left"
            >
              <div className="w-14 h-14 bg-rose-600 rounded-2xl flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                <Plus className="w-7 h-7 text-white" />
              </div>
              <div>
                <span className="text-rose-500 font-bold text-xl block mb-1">Report Hazard</span>
                <p className="text-rose-600/60 text-sm leading-snug">Submit new incidents for immediate verification.</p>
              </div>
            </button>

            <button 
              onClick={() => navigate("nearby")}
              className="group bg-indigo-600/10 border border-indigo-600/20 p-8 rounded-[2rem] flex flex-col items-start gap-6 hover:bg-indigo-600/20 transition-all active:scale-[0.98] text-left"
            >
              <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                <Navigation className="w-7 h-7 text-white" />
              </div>
              <div>
                <span className="text-indigo-500 font-bold text-xl block mb-1">Nearby Alerts</span>
                <p className="text-indigo-600/60 text-sm leading-snug">Find the closest incidents and safe zones.</p>
              </div>
            </button>

            <button 
              onClick={() => {
                navigate("radio");
                fetchRadioFeeds();
              }}
              className="group bg-emerald-600/10 border border-emerald-600/20 p-8 rounded-[2rem] flex flex-col items-start gap-6 hover:bg-emerald-600/20 transition-all active:scale-[0.98] text-left"
            >
              <div className="w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                <Radio className="w-7 h-7 text-white" />
              </div>
              <div>
                <span className="text-emerald-500 font-bold text-xl block mb-1">Live Radio</span>
                <p className="text-emerald-600/60 text-sm leading-snug">Emergency broadcasts and official updates.</p>
              </div>
            </button>
          </div>

          
        </div>

        <footer className="absolute bottom-6 left-8 text-slate-700 text-[10px] font-bold uppercase tracking-[0.3em] hidden md:block">
          Community Safety Network • 2026
        </footer>
      </div>
    );
  }

  if (view === "admin") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white w-full max-w-4xl rounded-[2.5rem] p-8 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold flex items-center gap-3">
              <ShieldCheck className="w-8 h-8 text-slate-800" /> Admin Dashboard
            </h2>

            <div className="flex items-center gap-2">
              {isAdmin && (
                <button
                  onClick={handleAdminLogout}
                  className="px-4 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 text-sm font-bold text-slate-700 transition-all"
                >
                  Logout
                </button>
              )}
              <button
                onClick={() => navigate("landing")}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            </div>
          </div>

          {!isAdmin ? (
            <div className="w-full max-w-xs space-y-3">
              <input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 outline-none focus:ring-2 focus:ring-slate-500"
                placeholder="Admin email"
              />
              <div className="flex gap-2">
                <input
                  type="password"
                  value={adminPass}
                  onChange={(e) => setAdminPass(e.target.value)}
                  className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 outline-none focus:ring-2 focus:ring-slate-500"
                  placeholder="Password"
                />
                <button
                  onClick={handleAdminLogin}
                  disabled={adminAuthLoading}
                  className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-slate-800 transition-all disabled:opacity-70"
                >
                  {adminAuthLoading ? "..." : "Login"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-6 pr-2">
              <div className="bg-slate-50 border border-slate-100 rounded-[2rem] p-6">
                <h3 className="font-black text-slate-900 mb-2">Admin API Token</h3>
                <p className="text-xs text-slate-500 mb-4">
                  This token is sent as <code className="font-mono">x-admin-token</code> for status updates and bulk inserts.
                </p>
                <input
                  value={adminToken}
                  onChange={(e) => setAdminToken(e.target.value)}
                  placeholder="Paste ADMIN_TOKEN here"
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 outline-none focus:ring-2 focus:ring-slate-500 font-mono text-sm"
                />
              </div>

              <div className="grid grid-cols-1 gap-4">
                {events.map(event => (
                  <div key={event.id} className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className={cn("p-3 rounded-2xl", EVENT_TYPES.find(t => t.id === event.type)?.bg)}>
                        {React.createElement(EVENT_TYPES.find(t => t.id === event.type)?.icon || AlertTriangle, { className: cn("w-6 h-6", EVENT_TYPES.find(t => t.id === event.type)?.color) })}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-900 capitalize">{event.type}</h4>
                        <p className="text-xs text-slate-500 line-clamp-1">{event.description}</p>
                        <p className="text-[10px] text-slate-400">{format(event.timestamp, "MMM d, h:mm a")}</p>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                          Status: {event.status}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <button
                        onClick={() => setSelectedEvent(event)}
                        className="p-2 bg-white rounded-xl shadow-sm hover:bg-slate-100 transition-all text-slate-600"
                        title="Preview"
                      >
                        <Eye className="w-5 h-5" />
                      </button>

                      <button
                        onClick={() => handleUpdateStatus(event.id, "responded")}
                        className="px-3 py-2 bg-emerald-50 rounded-xl shadow-sm hover:bg-emerald-100 transition-all text-emerald-700 text-xs font-bold"
                        title="Mark resolved"
                      >
                        Resolved
                      </button>

                      <button
                        onClick={() => handleUpdateStatus(event.id, "past")}
                        className="px-3 py-2 bg-amber-50 rounded-xl shadow-sm hover:bg-amber-100 transition-all text-amber-700 text-xs font-bold"
                        title="Mark past"
                      >
                        Past
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(event.id, "false")}
                        className="px-3 py-2 bg-slate-100 rounded-xl shadow-sm hover:bg-slate-200 transition-all text-slate-700 text-xs font-bold"
                        title="Mark false"
                      >
                        False
                      </button>

                      <button
                        onClick={() => handleDeleteEvent(event.id)}
                        className="p-2 bg-rose-50 rounded-xl shadow-sm hover:bg-rose-100 transition-all text-rose-600"
                        title="Delete"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  if (view === "nearby") {
    const nearbyEvents = events
      .filter(e => e.status !== "deleted")
      .map(e => ({
        ...e,
        distance: userLocation ? getDistance(userLocation.lat, userLocation.lng, e.location.lat, e.location.lng) : Infinity
      }))
      .sort((a, b) => a.distance - b.distance);

    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold flex items-center gap-3">
              <Navigation className="w-8 h-8 text-indigo-600" /> Events Near Me
            </h2>
            <button onClick={() => navigate("landing")} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <ChevronLeft className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {nearbyEvents.length === 0 ? (
              <div className="text-center py-20 text-slate-400">
                <Globe className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>No events found nearby</p>
              </div>
            ) : (
              nearbyEvents.map(event => (
                <div 
                  key={event.id} 
                  onClick={() => {
                    setSelectedEvent(event);
                    navigate("map");
                  }}
                  className="bg-slate-50 p-4 rounded-3xl border border-slate-100 hover:border-indigo-200 transition-all cursor-pointer group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className={cn("px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider", EVENT_TYPES.find(t => t.id === event.type)?.bg, EVENT_TYPES.find(t => t.id === event.type)?.color)}>
                      {event.type}
                    </div>
                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
                      {event.distance.toFixed(1)} km away
                    </span>
                  </div>
                  <p className="text-slate-700 text-sm font-medium line-clamp-2 mb-2">{event.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">{format(event.timestamp, "h:mm a")}</span>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-all" />
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  if (view === "radio") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <audio ref={audioRef} className="hidden" />
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold flex items-center gap-3">
              <Radio className="w-8 h-8 text-emerald-600" /> Unified Radio Feed
            </h2>
            <button 
              onClick={() => {
                audioRef.current?.pause();
                setPlayingUrl(null);
                navigate("landing");
              }} 
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {isRadioLoading ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
                <p className="text-slate-500 font-medium">Scanning frequencies...</p>
              </div>
            ) : radioFeeds.length === 0 ? (
              <div className="text-center py-20 text-slate-400">
                <Radio className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>No radio stations found</p>
                <button onClick={fetchRadioFeeds} className="mt-4 text-emerald-600 font-bold hover:underline">Retry Scan</button>
              </div>
            ) : (
              radioFeeds.map((feed, idx) => (
                <div key={idx} className={cn(
                  "bg-slate-50 p-5 rounded-3xl border transition-all",
                  playingUrl === feed.url ? "border-emerald-500 bg-emerald-50/30" : "border-slate-100"
                )}>
                  <div className="flex items-center gap-4 mb-3">
                    <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center overflow-hidden">
                      {feed.favicon ? (
                        <img src={feed.favicon} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <Radio className="w-6 h-6 text-emerald-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-900 truncate">{feed.name}</h4>
                        {feed.isRadioplayer && (
                          <span className="bg-rose-100 text-rose-600 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter">Radioplayer</span>
                        )}
                      </div>
                      <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">{feed.frequency || "Live Stream"}</p>
                    </div>
                  </div>
                  <p className="text-slate-600 text-sm leading-relaxed mb-4 line-clamp-2">{feed.description}</p>
                  
                  <button 
                    onClick={() => togglePlayback(feed.url)}
                    className={cn(
                      "w-full py-3 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2",
                      playingUrl === feed.url 
                        ? "bg-rose-600 text-white hover:bg-rose-700" 
                        : "bg-emerald-600 text-white hover:bg-emerald-700"
                    )}
                  >
                    {playingUrl === feed.url ? (
                      <><X className="w-4 h-4" /> Stop Listening</>
                    ) : (
                      <><Radio className="w-4 h-4" /> Listen Now</>
                    )}
                  </button>
                </div>
              ))
            )}
          </div>

          {playingUrl && (
            <div className="mt-6 p-4 bg-slate-900 rounded-3xl flex items-center gap-4 animate-pulse">
              <div className="w-2 h-2 bg-emerald-500 rounded-full" />
              <p className="text-white text-xs font-bold uppercase tracking-widest">Now Playing...</p>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  if (view === "report") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl"
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Report Event</h2>
            <button onClick={() => navigate("landing")} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <ChevronLeft className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleReportSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Hazard Type</label>
              <div className="grid grid-cols-3 gap-3">
                {EVENT_TYPES.map(type => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setReportData({...reportData, type: type.id})}
                    className={cn(
                      "flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all gap-2",
                      reportData.type === type.id 
                        ? "border-rose-600 bg-rose-50 text-rose-600" 
                        : "border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200"
                    )}
                  >
                    <type.icon className="w-6 h-6" />
                    <span className="text-[10px] font-bold uppercase">{type.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Description</label>
              <textarea 
                required
                rows={3}
                value={reportData.description}
                onChange={e => setReportData({...reportData, description: e.target.value})}
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-all resize-none"
                placeholder="Describe the situation..."
              />
            </div>

            {reportData.type === "market" && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="space-y-4 bg-indigo-50 p-4 rounded-2xl border border-indigo-100"
              >
                <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" /> Market Price Details
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Item Name</label>
                    <input 
                      type="text"
                      value={reportData.priceItem}
                      onChange={e => setReportData({...reportData, priceItem: e.target.value})}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                      placeholder="e.g. Rice"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Price</label>
                    <input 
                      type="text"
                      value={reportData.priceValue}
                      onChange={e => setReportData({...reportData, priceValue: e.target.value})}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                      placeholder="e.g. $2.50"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Photo Evidence</label>
              <div className="relative">
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={e => setReportData({...reportData, image: e.target.files?.[0] || null})}
                  className="hidden" 
                  id="photo-upload"
                />
                <label 
                  htmlFor="photo-upload"
                  className="flex items-center justify-center gap-3 w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-all text-slate-500"
                >
                  {reportData.image ? (
                    <span className="text-emerald-600 font-bold flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5" /> {reportData.image.name}
                    </span>
                  ) : (
                    <><Camera className="w-5 h-5" /> Take or Upload Photo</>
                  )}
                </label>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={submitting}
              className="w-full bg-rose-600 text-white py-4 rounded-2xl font-bold hover:bg-rose-700 transition-all shadow-xl shadow-rose-100 flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>Submit Emergency Report <Send className="w-4 h-4" /></>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-slate-900">
      <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ""}>
        <Map
          defaultCenter={userLocation || { lat: 0, lng: 0 }}
          defaultZoom={13}
          gestureHandling={"greedy"}
          disableDefaultUI={true}
          className="h-full w-full"
        >
          <MapBridge onMap={setMapInstance} />
          <PlainMarkers
            events={events}
            userLocation={userLocation}
            selectedEvent={selectedEvent}
            onSelectEvent={setSelectedEvent}
          />
        </Map>
      </APIProvider>

      {/* UI Overlays */}
      <div className="absolute top-6 left-6 right-6 flex flex-col gap-4 pointer-events-none">
        <div className="flex justify-between items-start">
          <button
            onClick={() => navigate("landing")}
            className="bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-white/20 pointer-events-auto hover:bg-white transition-all text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-rose-600 rounded-xl flex items-center justify-center shadow-lg shadow-rose-200">
                <AlertTriangle className="text-white w-6 h-6" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900">Event Response</h1>
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Real-time Event Map</p>
              </div>
            </div>
          </button>

          <div className="flex flex-col gap-3 pointer-events-auto">
            <button 
              onClick={() => navigate("landing")}
              className="w-12 h-12 bg-white rounded-2xl shadow-xl flex items-center justify-center hover:bg-slate-50 transition-all border border-slate-100"
            >
              <ChevronLeft className="w-6 h-6 text-slate-600" />
            </button>
            <button 
              onClick={() => {
                setIsSidebarOpen(v => !v);
                if (userLocation && mapInstance) {
                  mapInstance.panTo(userLocation);
                  mapInstance.setZoom(Math.max(mapInstance.getZoom() ?? 13, 14));
                }
              }}
              className="w-12 h-12 bg-white rounded-2xl shadow-xl flex items-center justify-center hover:bg-slate-50 transition-all border border-slate-100"
            >
              <Navigation className="w-6 h-6 text-slate-600" />
            </button>
          </div>
        </div>

        {/* Error Notification */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-amber-50 border border-amber-200 p-4 rounded-2xl shadow-lg flex items-center gap-3 pointer-events-auto max-w-md"
            >
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <p className="text-xs font-medium text-amber-800">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Sidebar (toggle with location button) */}
      <AnimatePresence>
        {isSidebarOpen && view === "map" && (
          <motion.aside
            initial={{ x: 380, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 380, opacity: 0 }}
            className="absolute top-6 bottom-6 right-6 w-[360px] z-[70] pointer-events-auto"
          >
            <div className="h-full bg-white/95 backdrop-blur-md rounded-[2rem] shadow-2xl border border-white/30 overflow-hidden flex flex-col">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-black text-slate-900 tracking-tight">Events</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                    {events.filter(e => e.status !== "deleted").length} active / recent
                  </p>
                </div>
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="w-10 h-10 rounded-2xl bg-slate-50 hover:bg-slate-100 flex items-center justify-center"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {events
                  .filter(e => e.status !== "deleted")
                  .map(e => ({
                    event: e,
                    distance: userLocation ? getDistance(userLocation.lat, userLocation.lng, e.location.lat, e.location.lng) : null
                  }))
                  .sort((a, b) => {
                    if (a.distance == null && b.distance == null) return 0;
                    if (a.distance == null) return 1;
                    if (b.distance == null) return -1;
                    return a.distance - b.distance;
                  })
                  .map(({ event, distance }) => (
                    <button
                      key={event.id}
                      onClick={() => {
                        setSelectedEvent(event);
                        if (mapInstance) {
                          mapInstance.panTo(event.location);
                          mapInstance.setZoom(Math.max(mapInstance.getZoom() ?? 13, 15));
                        }
                      }}
                      className={cn(
                        "w-full text-left p-4 rounded-3xl border transition-all",
                        selectedEvent?.id === event.id
                          ? "border-rose-200 bg-rose-50/40"
                          : "border-slate-100 bg-white hover:bg-slate-50"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className={cn("px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider", EVENT_TYPES.find(t => t.id === event.type)?.bg, EVENT_TYPES.find(t => t.id === event.type)?.color)}>
                          {event.type}
                        </div>
                        {distance != null && (
                          <div className="text-[10px] font-bold text-slate-400">
                            {distance.toFixed(1)} km
                          </div>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-slate-800 line-clamp-2">{event.description}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className={cn(
                          "text-[10px] font-black px-2 py-0.5 rounded-full uppercase",
                          event.status === "active" ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600"
                        )}>
                          {event.status}
                        </span>
                        <span className="text-[10px] text-slate-400">{format(event.timestamp, "MMM d, h:mm a")}</span>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Event Preview Panel (Bottom) */}
      <AnimatePresence>
        {selectedEvent && view === "map" && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="absolute bottom-6 left-6 right-6 z-[60] pointer-events-none"
          >
            <div className="max-w-md mx-auto bg-white/95 backdrop-blur-md rounded-[2rem] p-6 shadow-2xl border border-white/20 pointer-events-auto">
              <div className="flex gap-4 items-center">
                <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center shrink-0", EVENT_TYPES.find(t => t.id === selectedEvent.type)?.bg)}>
                  {React.createElement(EVENT_TYPES.find(t => t.id === selectedEvent.type)?.icon || AlertTriangle, { className: cn("w-8 h-8", EVENT_TYPES.find(t => t.id === selectedEvent.type)?.color) })}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-bold text-slate-900 capitalize truncate">{selectedEvent.type}</h3>
                    <button onClick={() => setSelectedEvent(null)} className="p-1 hover:bg-slate-100 rounded-full">
                      <X className="w-4 h-4 text-slate-400" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-1 mb-2">{selectedEvent.description}</p>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{format(selectedEvent.timestamp, "h:mm a")}</span>
                    {selectedEvent.priceData && (
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                        {selectedEvent.priceData.item}: {selectedEvent.priceData.price}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={() => handleVote(selectedEvent.id, 1)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm transition-all bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  👍 Upvote ({selectedEvent.votes?.up ?? 0})
                </button>

                <button
                  onClick={() => handleVote(selectedEvent.id, -1)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm transition-all bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  👎 Downvote ({selectedEvent.votes?.down ?? 0})
                </button>
              </div>

              {selectedEvent.link && (
                <div className="mt-3">
                  <a
                    href={selectedEvent.link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-black text-indigo-600 hover:underline"
                  >
                    Open source link
                  </a>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Closest event (floating) */}
      {view === "map" && userLocation && events.filter(e => e.status !== "deleted").length > 0 && (() => {
        const active = events.filter(e => e.status !== "deleted");
        const closest = active
          .map(e => ({
            event: e,
            distance: getDistance(userLocation.lat, userLocation.lng, e.location.lat, e.location.lng)
          }))
          .sort((a, b) => a.distance - b.distance)[0];
        if (!closest) return null;
        return (
          <div className="absolute bottom-6 left-6 z-[65] pointer-events-auto max-w-xs">
            <button
              onClick={() => {
                setSelectedEvent(closest.event);
                if (mapInstance) {
                  mapInstance.panTo(closest.event.location);
                  mapInstance.setZoom(Math.max(mapInstance.getZoom() ?? 13, 15));
                }
              }}
              className="w-full bg-slate-900/90 text-white rounded-[1.75rem] p-5 shadow-2xl border border-white/10 backdrop-blur-md text-left hover:bg-slate-900 transition-all"
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-300">
                  Closest event
                </div>
                <div className="text-[10px] font-bold text-slate-300">
                  {closest.distance.toFixed(1)} km
                </div>
              </div>
              <div className="font-black tracking-tight capitalize">{closest.event.type}</div>
              <div className="text-xs text-slate-300 mt-1 line-clamp-2">{closest.event.description}</div>
            </button>
          </div>
        );
      })()}
    </div>
  );
}