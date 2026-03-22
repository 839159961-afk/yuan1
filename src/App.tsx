import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, Zap, Users, Info, Send, RefreshCw, X, 
  User, Plus, Trash2, MessageSquare, Activity, 
  TrendingUp, Shield, LogIn, LogOut, ChevronRight,
  Settings, Heart, Briefcase, Home, Globe, Book, Link2,
  Bell, AlertTriangle, Edit, Eye, Archive, Package, Mail
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  serverTimestamp,
  getDoc,
  getDocFromServer,
  getDocs,
  writeBatch,
  limit,
  Timestamp
} from 'firebase/firestore';
import { auth, db } from './firebase';
import FateGraph from './components/FateGraph';
import JSZip from 'jszip';
import { analyzeRelationship, analyzeNetwork, extractEntities, analyzeMutualPerception, analyzeSelf, analyzePersonalityChange } from './services/geminiService';

// --- Types ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email || undefined,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface UserProfile {
  name: string;
  personalityType: string;
  description: string;
  updatedAt: any;
}

interface Relationship {
  id: string;
  targetName: string;
  personalityType: string;
  type: string;
  description?: string;
  chatHistory?: string;
  status: string;
  healthScore?: number;
  lastAnalysis?: string;
  mentionCount: number;
  isDormant: boolean;
  lastMentionedAt: any;
  updatedAt: any;
}

interface EventLog {
  id: string;
  content: string;
  timestamp: any;
}

interface DiaryEntry {
  id: string;
  title?: string;
  content: string;
  mentions: string[];
  timestamp: any;
  isPathTaken?: boolean;
}

interface Connection {
  id: string;
  nodeA: string;
  nodeB: string;
  perceptionAtoB?: string;
  perceptionBtoA?: string;
  updatedAt: any;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'critical';
  timestamp: any;
  read: boolean;
  relId?: string;
}

// --- Components ---

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (event.error?.message?.includes('Missing or insufficient permissions')) {
        setHasError(true);
        setErrorMsg('权限不足或配置错误，请检查 Firebase 设置。');
      }
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white p-8 text-center">
        <div className="glass p-8 rounded-3xl border-fate-red/30">
          <Shield className="text-fate-red mx-auto mb-4" size={48} />
          <h2 className="text-2xl font-serif mb-4">系统同步异常</h2>
          <p className="text-white/60 mb-6">{errorMsg}</p>
          <button onClick={() => window.location.reload()} className="bg-fate-red text-white px-6 py-2 rounded-full">
            重试
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [selectedRelId, setSelectedRelId] = useState<string | null>(null);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [diaries, setDiaries] = useState<DiaryEntry[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [showAddRel, setShowAddRel] = useState(false);
  const [showEditRel, setShowEditRel] = useState(false);
  const [showDiary, setShowDiary] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showSelfAnalysis, setShowSelfAnalysis] = useState(false);
  const [showMemoryBox, setShowMemoryBox] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [selfAnalysis, setSelfAnalysis] = useState<string | null>(null);
  const [isAnalyzingSelf, setIsAnalyzingSelf] = useState(false);
  const [networkAnalysis, setNetworkAnalysis] = useState<string | null>(null);
  const [isAnalyzingNetwork, setIsAnalyzingNetwork] = useState(false);
  const [linkingNodes, setLinkingNodes] = useState<string[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null);

  const activeRelationships = useMemo(() => relationships.filter(r => !r.isDormant), [relationships]);
  const dormantRelationships = useMemo(() => relationships.filter(r => r.isDormant), [relationships]);

  const sortedByMentions = useMemo(() => {
    return [...activeRelationships].sort((a, b) => (b.mentionCount || 0) - (a.mentionCount || 0));
  }, [activeRelationships]);

  const getRelationshipTier = (rel: Relationship) => {
    const index = sortedByMentions.findIndex(r => r.id === rel.id);
    if (index >= 0 && index < 5) return '核心圈';
    if (index >= 5 && index < 13) return '次核心';
    if (rel.healthScore && rel.healthScore > 85 && rel.mentionCount < 5) return '外围重要';
    return '普通记录';
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });

    // Test Firestore connection
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. The client is offline.");
        }
      }
    };
    testConnection();

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setRelationships([]);
      setDiaries([]);
      setConnections([]);
      return;
    }

    // Sync Profile
    const profileRef = doc(db, 'users', user.uid);
    const unsubProfile = onSnapshot(profileRef, (doc) => {
      if (doc.exists()) {
        setProfile(doc.data() as UserProfile);
      } else {
        setShowProfileEdit(true);
        setShowWelcome(true);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`));

    // Sync Relationships
    const relsRef = collection(db, 'users', user.uid, 'relationships');
    const unsubRels = onSnapshot(relsRef, (snap) => {
      setRelationships(snap.docs.map(d => ({ id: d.id, ...d.data() } as Relationship)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/relationships`));

    // Sync Diaries
    const diariesRef = collection(db, 'users', user.uid, 'diaries');
    const qDiaries = query(diariesRef, orderBy('timestamp', 'desc'));
    const unsubDiaries = onSnapshot(qDiaries, (snap) => {
      setDiaries(snap.docs.map(d => ({ id: d.id, ...d.data() } as DiaryEntry)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/diaries`));

    // Sync Connections
    const connectionsRef = collection(db, 'users', user.uid, 'connections');
    const unsubConnections = onSnapshot(connectionsRef, (snap) => {
      setConnections(snap.docs.map(d => ({ id: d.id, ...d.data() } as Connection)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/connections`));

    // Sync Notifications
    const notifsRef = collection(db, 'users', user.uid, 'notifications');
    const qNotifs = query(notifsRef, orderBy('timestamp', 'desc'), limit(20));
    const unsubNotifs = onSnapshot(qNotifs, (snap) => {
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notification)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/notifications`));

    return () => {
      unsubProfile();
      unsubRels();
      unsubDiaries();
      unsubConnections();
      unsubNotifs();
    };
  }, [user]);

  useEffect(() => {
    if (!user || !selectedRelId) {
      setEvents([]);
      return;
    }

    const eventsRef = collection(db, 'users', user.uid, 'relationships', selectedRelId, 'events');
    const q = query(eventsRef, orderBy('timestamp', 'desc'));
    const unsubEvents = onSnapshot(q, (snap) => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as EventLog)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/relationships/${selectedRelId}/events`));

    return () => unsubEvents();
  }, [user, selectedRelId]);

  // --- Actions ---

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      if (err.code === 'auth/cancelled-popup-request') {
        console.warn('Login request cancelled (multiple clicks)');
      } else {
        console.error('Login error:', err);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => signOut(auth);

  const saveProfile = async (data: Partial<UserProfile>) => {
    if (!user || !profile) return;
    setIsLoading(true);
    try {
      // Analyze personality change if profile already exists
      const { hasSignificantChange, diaryContent } = await analyzePersonalityChange(profile, data);

      await setDoc(doc(db, 'users', user.uid), {
        ...data,
        updatedAt: serverTimestamp()
      }, { merge: true });

      if (hasSignificantChange && diaryContent) {
        await addDoc(collection(db, 'users', user.uid, 'diaries'), {
          content: diaryContent,
          mentions: [],
          timestamp: serverTimestamp(),
          isPathTaken: true // Special flag for "Path Taken" diaries
        });
        
        // Create a notification for the user
        await addDoc(collection(db, 'users', user.uid, 'notifications'), {
          title: '✨ 灵魂蜕变',
          message: '检测到你的性格发生了显著变化，系统已为你生成了一篇《来时路》反思日记。',
          type: 'info',
          timestamp: serverTimestamp(),
          read: false
        });
      }

      setShowProfileEdit(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
    }
    setIsLoading(false);
  };

  const addRelationship = async (data: Partial<Relationship>) => {
    if (!user) return;
    try {
      // Check limit
      if (activeRelationships.length >= 50) {
        // Find the least active relationship to move to dormant
        const leastActive = [...activeRelationships].sort((a, b) => {
          if (a.mentionCount !== b.mentionCount) return a.mentionCount - b.mentionCount;
          return a.updatedAt?.toMillis() - b.updatedAt?.toMillis();
        })[0];

        if (leastActive) {
          await updateDoc(doc(db, 'users', user.uid, 'relationships', leastActive.id), {
            isDormant: true,
            updatedAt: serverTimestamp()
          });
        }
      }

      await addDoc(collection(db, 'users', user.uid, 'relationships'), {
        ...data,
        status: '初始连接',
        mentionCount: 0,
        isDormant: false,
        lastMentionedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setShowAddRel(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/relationships`);
    }
  };

  const addEvent = async (content: string) => {
    if (!user || !selectedRelId) return;
    try {
      await addDoc(collection(db, 'users', user.uid, 'relationships', selectedRelId, 'events'), {
        content,
        timestamp: serverTimestamp()
      });
      await updateDoc(doc(db, 'users', user.uid, 'relationships', selectedRelId), {
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/relationships/${selectedRelId}`);
    }
  };

  const triggerRelAnalysis = async (rel: Relationship) => {
    if (!user) return;
    setIsLoading(true);
    try {
      const result = await analyzeRelationship(profile, rel, events);
      const { healthScore, analysis, reminder } = result;
      
      await updateDoc(doc(db, 'users', user.uid, 'relationships', rel.id), {
        lastAnalysis: analysis,
        healthScore: healthScore,
        updatedAt: serverTimestamp()
      });

      // Create notification
      if (healthScore < 60) {
        await addDoc(collection(db, 'users', user.uid, 'notifications'), {
          title: '⚠️ 关系预警',
          message: `与 ${rel.targetName} 的关系健康度已降至 ${healthScore}。建议：${reminder}`,
          type: 'critical',
          timestamp: serverTimestamp(),
          read: false,
          relId: rel.id
        });
      } else if (healthScore < 80) {
        await addDoc(collection(db, 'users', user.uid, 'notifications'), {
          title: '💡 维护建议',
          message: `与 ${rel.targetName} 的关系需要关注。建议：${reminder}`,
          type: 'warning',
          timestamp: serverTimestamp(),
          read: false,
          relId: rel.id
        });
      }
    } catch (err) {
      console.error('Analysis failed:', err);
    }
    setIsLoading(false);
  };

  const updateRelationship = async (id: string, data: Partial<Relationship>) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'relationships', id), {
        ...data,
        updatedAt: serverTimestamp()
      });
      setShowEditRel(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/relationships/${id}`);
    }
  };

  const markNotificationRead = async (id: string) => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid, 'notifications', id), { read: true });
  };

  const triggerNetworkAnalysis = async () => {
    if (!user) return;
    setIsAnalyzingNetwork(true);
    const analysis = await analyzeNetwork(profile, relationships);
    setNetworkAnalysis(analysis);
    setIsAnalyzingNetwork(false);
  };

  const triggerSelfAnalysis = async () => {
    if (!user || !profile) return;
    setIsAnalyzingSelf(true);
    setShowSelfAnalysis(true);
    const analysis = await analyzeSelf(profile, relationships, diaries);
    setSelfAnalysis(analysis);
    setIsAnalyzingSelf(false);
  };

  const exportData = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      // Fetch all events for all relationships to ensure complete backup
      const allEvents: any[] = [];
      for (const rel of relationships) {
        const eventsSnap = await getDocs(collection(db, 'users', user.uid, 'relationships', rel.id, 'events'));
        eventsSnap.forEach(doc => {
          allEvents.push({ ...doc.data(), id: doc.id, relId: rel.id });
        });
      }

      const data = {
        profile,
        relationships,
        events: allEvents,
        diaries,
        connections,
        exportedAt: new Date().toISOString(),
        version: '1.1'
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ParticleCosmos_Memory_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      if (link.parentNode === document.body) {
        document.body.removeChild(link);
      }
      URL.revokeObjectURL(url);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'export');
    } finally {
      setIsLoading(false);
    }
  };

  const importData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const buffer = event.target?.result as ArrayBuffer;
        const view = new Uint8Array(buffer);
        let content: string;

        // Check for ZIP magic number "PK" (0x50 0x4B)
        if (view[0] === 0x50 && view[1] === 0x4B) {
          const zip = await JSZip.loadAsync(buffer);
          const files = Object.values(zip.files);
          
          // Find the most likely JSON memory file
          let jsonFile = files.find(f => 
            !f.dir && 
            f.name.toLowerCase().endsWith('.json') && 
            !f.name.includes('__MACOSX') && 
            !f.name.includes('.DS_Store')
          );

          // Fallback: if no .json file found but there is exactly one non-system file, try it
          if (!jsonFile) {
            const potentialFiles = files.filter(f => 
              !f.dir && 
              !f.name.includes('__MACOSX') && 
              !f.name.includes('.DS_Store') &&
              !f.name.includes('desktop.ini') &&
              !f.name.includes('Thumbs.db')
            );
            if (potentialFiles.length === 1) {
              jsonFile = potentialFiles[0];
            }
          }

          if (jsonFile) {
            content = await jsonFile.async('string');
          } else {
            const hasIWork = files.some(f => f.name.endsWith('.iwa') || f.name.endsWith('.plist'));
            if (hasIWork) {
              throw new Error('您似乎上传了一个 Apple iWork 文档（如 Pages, Numbers 或 Keynote）。请上传从“封存这份记忆”按钮导出的 .json 记忆文件。');
            }
            const fileList = files.map(f => f.name).slice(0, 10).join(', ') + (files.length > 10 ? '...' : '');
            throw new Error(`ZIP文件中未找到JSON记忆文件。请确保上传的是正确的导出文件。 (包含文件: ${fileList})`);
          }
        } else {
          content = new TextDecoder().decode(buffer);
        }

        const data = JSON.parse(content);
        if (!data.profile && !data.relationships) {
          throw new Error('无效的记忆文件');
        }

        setIsLoading(true);
        
        // Helper to convert JSON timestamp objects back to Firestore Timestamps
        const toTimestamp = (val: any) => {
          if (!val) return val;
          // Handle Firestore Timestamp object format {seconds, nanoseconds}
          if (typeof val === 'object' && val.seconds !== undefined) {
            return new Timestamp(val.seconds, val.nanoseconds);
          }
          // Handle ISO string format from JSON.stringify
          if (typeof val === 'string' && !isNaN(Date.parse(val))) {
            return Timestamp.fromDate(new Date(val));
          }
          return val;
        };

        // 1. Profile
        if (data.profile) {
          const { id, ...profileData } = data.profile;
          await setDoc(doc(db, 'users', user.uid), { 
            ...profileData, 
            updatedAt: serverTimestamp() 
          });
        }

        // 2. Relationships
        if (data.relationships) {
          for (const rel of data.relationships) {
            const processedRel = { ...rel };
            if (processedRel.updatedAt) processedRel.updatedAt = toTimestamp(processedRel.updatedAt);
            if (processedRel.lastMentionedAt) processedRel.lastMentionedAt = toTimestamp(processedRel.lastMentionedAt);
            await setDoc(doc(db, 'users', user.uid, 'relationships', rel.id), processedRel);
          }
        }

        // 3. Diaries
        if (data.diaries) {
          for (const diary of data.diaries) {
            const processedDiary = { ...diary };
            if (processedDiary.timestamp) processedDiary.timestamp = toTimestamp(processedDiary.timestamp);
            await setDoc(doc(db, 'users', user.uid, 'diaries', diary.id), processedDiary);
          }
        }

        // 4. Connections
        if (data.connections) {
          for (const conn of data.connections) {
            const processedConn = { ...conn };
            if (processedConn.updatedAt) processedConn.updatedAt = toTimestamp(processedConn.updatedAt);
            await setDoc(doc(db, 'users', user.uid, 'connections', conn.id), processedConn);
          }
        }

        // 5. Events
        if (data.events) {
          for (const event of data.events) {
            if (event.relId) {
              const processedEvent = { ...event };
              const relId = processedEvent.relId;
              delete processedEvent.relId;
              if (processedEvent.timestamp) processedEvent.timestamp = toTimestamp(processedEvent.timestamp);
              await setDoc(doc(db, 'users', user.uid, 'relationships', relId, 'events', event.id), processedEvent);
            }
          }
        }
        
        alert('记忆已唤醒，宇宙正在重构。');
        setShowMemoryBox(false);
        window.location.reload();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'import');
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const clearAllData = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const batch = writeBatch(db);
      
      // 1. Relationships & Events
      const relsSnap = await getDocs(collection(db, 'users', user.uid, 'relationships'));
      for (const relDoc of relsSnap.docs) {
        // Delete events subcollection for each relationship
        const eventsSnap = await getDocs(collection(db, 'users', user.uid, 'relationships', relDoc.id, 'events'));
        eventsSnap.forEach(eventDoc => batch.delete(eventDoc.ref));
        batch.delete(relDoc.ref);
      }

      // 2. Diaries
      const diariesSnap = await getDocs(collection(db, 'users', user.uid, 'diaries'));
      diariesSnap.forEach(diaryDoc => batch.delete(diaryDoc.ref));

      // 3. Connections
      const connectionsSnap = await getDocs(collection(db, 'users', user.uid, 'connections'));
      connectionsSnap.forEach(connDoc => batch.delete(connDoc.ref));

      // 4. Notifications
      const notificationsSnap = await getDocs(collection(db, 'users', user.uid, 'notifications'));
      notificationsSnap.forEach(notifDoc => batch.delete(notifDoc.ref));

      await batch.commit();
      
      alert('宇宙已重归寂静，所有的因缘都已消散。');
      setShowClearConfirm(false);
      setShowMemoryBox(false);
      window.location.reload();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'clearAllData');
    } finally {
      setIsLoading(false);
    }
  };

  const addDiaryEntry = async (content: string) => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { mentionedIds, newEntities } = await extractEntities(content, relationships);
      
      // Create new entities if found
      for (const entity of newEntities) {
        // Check limit for new entities too
        if (activeRelationships.length >= 50) {
          const leastActive = [...activeRelationships].sort((a, b) => {
            if (a.mentionCount !== b.mentionCount) return a.mentionCount - b.mentionCount;
            return a.updatedAt?.toMillis() - b.updatedAt?.toMillis();
          })[0];
          if (leastActive) {
            await updateDoc(doc(db, 'users', user.uid, 'relationships', leastActive.id), {
              isDormant: true,
              updatedAt: serverTimestamp()
            });
          }
        }

        const docRef = await addDoc(collection(db, 'users', user.uid, 'relationships'), {
          targetName: entity.name,
          type: entity.type || 'other',
          personalityType: entity.personality || '',
          status: '由日记发现',
          mentionCount: 1,
          isDormant: false,
          lastMentionedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        mentionedIds.push(docRef.id);
      }

      // Add diary entry
      await addDoc(collection(db, 'users', user.uid, 'diaries'), {
        content,
        mentions: mentionedIds,
        timestamp: serverTimestamp()
      });

      // Update mentioned relationships
      for (const id of mentionedIds) {
        const rel = relationships.find(r => r.id === id);
        const wasDormant = rel?.isDormant;

        // If it was dormant and we are reactivating it, check limit
        if (wasDormant && activeRelationships.length >= 50) {
          const leastActive = [...activeRelationships].sort((a, b) => {
            if (a.mentionCount !== b.mentionCount) return a.mentionCount - b.mentionCount;
            return a.updatedAt?.toMillis() - b.updatedAt?.toMillis();
          })[0];
          if (leastActive && leastActive.id !== id) {
            await updateDoc(doc(db, 'users', user.uid, 'relationships', leastActive.id), {
              isDormant: true,
              updatedAt: serverTimestamp()
            });
          }
        }

        await updateDoc(doc(db, 'users', user.uid, 'relationships', id), {
          mentionCount: (rel?.mentionCount || 0) + 1,
          isDormant: false,
          lastMentionedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        await addDoc(collection(db, 'users', user.uid, 'relationships', id, 'events'), {
          content: `日记提及：${content.substring(0, 50)}...`,
          timestamp: serverTimestamp()
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/diaries`);
    }

    setIsLoading(false);
  };

  const reactivateRelationship = async (id: string) => {
    if (!user) return;
    try {
      // Check limit before reactivating
      if (activeRelationships.length >= 50) {
        const leastActive = [...activeRelationships].sort((a, b) => {
          if (a.mentionCount !== b.mentionCount) return a.mentionCount - b.mentionCount;
          return a.updatedAt?.toMillis() - b.updatedAt?.toMillis();
        })[0];
        if (leastActive) {
          await updateDoc(doc(db, 'users', user.uid, 'relationships', leastActive.id), {
            isDormant: true,
            updatedAt: serverTimestamp()
          });
        }
      }

      await updateDoc(doc(db, 'users', user.uid, 'relationships', id), {
        isDormant: false,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/relationships/${id}`);
    }
  };

  const handleNodeClick = (nodeId: string) => {
    if (linkingNodes.length === 1) {
      if (linkingNodes[0] === nodeId) {
        setLinkingNodes([]);
        return;
      }
      createConnection(linkingNodes[0], nodeId);
      setLinkingNodes([]);
    } else {
      setSelectedRelId(nodeId === 'me' ? null : nodeId);
    }
  };

  const createConnection = async (nodeAId: string, nodeBId: string) => {
    if (!user || nodeAId === 'me' || nodeBId === 'me') return;
    
    // Check if already exists
    const existing = connections.find(c => (c.nodeA === nodeAId && c.nodeB === nodeBId) || (c.nodeA === nodeBId && c.nodeB === nodeAId));
    if (existing) {
      setSelectedConnection(existing);
      return;
    }

    setIsLoading(true);
    const nodeA = relationships.find(r => r.id === nodeAId);
    const nodeB = relationships.find(r => r.id === nodeBId);
    
    try {
      const perceptions = await analyzeMutualPerception(nodeA, nodeB, profile);
      
      const docRef = await addDoc(collection(db, 'users', user.uid, 'connections'), {
        nodeA: nodeAId,
        nodeB: nodeBId,
        ...perceptions,
        updatedAt: serverTimestamp()
      });

      setSelectedConnection({ id: docRef.id, nodeA: nodeAId, nodeB: nodeBId, ...perceptions, updatedAt: null });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/connections`);
    }
    setIsLoading(false);
  };

  // --- Graph Data ---

  const graphData = useMemo(() => {
    const nodes = [
      { id: 'me', name: profile?.name || '我', val: 6, color: '#00F2FF' }
    ];
    const links: any[] = [];

    activeRelationships.forEach(rel => {
      const typeLower = rel.type.toLowerCase();
      const tier = getRelationshipTier(rel);
      
      const color = typeLower.includes('伴侣') || typeLower.includes('爱') || typeLower.includes('partner') ? '#FF2D55' : 
                    typeLower.includes('家') || typeLower.includes('亲') || typeLower.includes('family') ? '#8A2BE2' : 
                    typeLower.includes('友') || typeLower.includes('friend') ? '#00F2FF' : '#FFFFFF';
      
      // Node size based on tier
      const val = tier === '核心圈' ? 8 : tier === '次核心' ? 6 : tier === '外围重要' ? 5 : 4;

      nodes.push({
        id: rel.id,
        name: rel.targetName,
        val,
        color
      });

      links.push({
        source: 'me',
        target: rel.id,
        momentum: tier === '核心圈' ? 1.5 : tier === '次核心' ? 1 : 0.5,
        intimacy: tier === '核心圈' ? 1 : tier === '次核心' ? 0.8 : 0.5,
        color: color + '44' // Transparent link to me
      });
    });

    connections.forEach(conn => {
      // Only show connections if both nodes are active
      if (activeRelationships.some(r => r.id === conn.nodeA) && activeRelationships.some(r => r.id === conn.nodeB)) {
        links.push({
          source: conn.nodeA,
          target: conn.nodeB,
          color: '#FFFFFF88',
          isInterNode: true
        });
      }
    });

    return { nodes, links };
  }, [profile, activeRelationships, connections, sortedByMentions]);

  // --- Render Helpers ---

  if (!isAuthReady) return <div className="h-screen bg-black flex items-center justify-center text-fate-cyan animate-pulse">Initializing Cosmos...</div>;

  if (!user) {
    return (
      <div className="h-screen bg-black flex flex-col items-center justify-center p-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-lg"
        >
          <h1 className="text-6xl font-serif mb-4 tracking-widest">缘 <span className="text-sm font-sans text-fate-cyan">PARTICLE</span></h1>
          <p className="text-white/50 mb-12 font-serif italic">"每一个粒子的相遇，都是久别重逢。"</p>
          <button 
            onClick={handleLogin}
            disabled={isLoggingIn}
            className={`bg-white text-black px-12 py-4 rounded-full font-bold flex items-center gap-3 hover:bg-fate-cyan transition-colors mx-auto ${isLoggingIn ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isLoggingIn ? <RefreshCw size={20} className="animate-spin" /> : <LogIn size={20} />}
            {isLoggingIn ? '正在连接粒子星云...' : '进入粒子宇宙'}
          </button>
        </motion.div>
      </div>
    );
  }

  const selectedRel = relationships.find(r => r.id === selectedRelId);

  return (
    <ErrorBoundary>
      <div className="relative w-full h-screen bg-black overflow-hidden font-sans text-white">
        {/* Background Graph */}
        <div className="absolute inset-0 z-0">
          <FateGraph 
            nodes={graphData.nodes} 
            links={graphData.links} 
            onNodeClick={(node) => handleNodeClick(node.id)}
          />
        </div>

        {/* Linking Mode Overlay */}
        {linkingNodes.length > 0 && (
          <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center bg-fate-cyan/5 border-4 border-fate-cyan/20 animate-pulse">
            <div className="glass p-4 rounded-2xl pointer-events-auto">
              <p className="text-fate-cyan font-bold flex items-center gap-2">
                <Link2 className="animate-spin" /> 请选择第二个节点以建立连结...
              </p>
              <button 
                onClick={() => setLinkingNodes([])}
                className="mt-2 text-xs text-white/50 hover:text-white underline"
              >
                取消连结
              </button>
            </div>
          </div>
        )}

        {/* Top Header */}
        <header className="absolute top-0 left-0 w-full p-6 z-20 flex justify-between items-center pointer-events-none">
          <div className="pointer-events-auto">
            <h1 className="text-3xl font-display font-bold tracking-tighter flex items-center gap-3 animate-slam">
              缘 <span className="text-xs font-mono font-light tracking-[0.5em] text-fate-cyan uppercase opacity-70">ParticleCosmos</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-4 pointer-events-auto">
            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="glass p-2 rounded-full hover:text-fate-cyan transition-colors relative"
              >
                <Bell size={20} />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute top-0 right-0 w-2 h-2 bg-fate-red rounded-full border border-black" />
                )}
              </button>
              
              <AnimatePresence>
                {showNotifications && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 mt-2 w-80 glass rounded-2xl p-4 z-50 max-h-[400px] overflow-y-auto custom-scrollbar"
                  >
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xs uppercase tracking-widest text-white/50">因缘提醒</h3>
                      <button 
                        onClick={() => setShowNotifications(false)}
                        className="text-white/20 hover:text-white"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div className="space-y-3">
                      {notifications.length === 0 && (
                        <p className="text-center py-8 text-white/20 text-xs italic">暂无提醒</p>
                      )}
                      {notifications.map(n => (
                        <div 
                          key={n.id} 
                          onClick={() => {
                            markNotificationRead(n.id);
                            if (n.relId) setSelectedRelId(n.relId);
                            setShowNotifications(false);
                          }}
                          className={`p-3 rounded-xl border transition-colors cursor-pointer ${
                            n.read ? 'bg-white/5 border-white/5' : 
                            n.type === 'critical' ? 'bg-fate-red/10 border-fate-red/30' : 
                            'bg-fate-cyan/10 border-fate-cyan/30'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {n.type === 'critical' ? <AlertTriangle size={12} className="text-fate-red" /> : <Info size={12} className="text-fate-cyan" />}
                            <span className={`text-[10px] font-bold uppercase ${n.type === 'critical' ? 'text-fate-red' : 'text-fate-cyan'}`}>
                              {n.title}
                            </span>
                          </div>
                          <p className="text-xs text-white/80 leading-relaxed">{n.message}</p>
                          <p className="text-[8px] text-white/20 mt-2 font-mono">
                            {n.timestamp?.toDate().toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="relative">
              <button 
                onClick={() => setShowMemoryBox(!showMemoryBox)}
                className="glass p-2 rounded-full hover:text-fate-cyan transition-colors"
                title="记忆宝盒"
              >
                <Package size={20} />
              </button>
              
              <AnimatePresence>
                {showMemoryBox && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 mt-2 w-72 glass rounded-2xl p-6 z-50 glow-cyan"
                  >
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="micro-label">记忆宝盒</h3>
                      <button 
                        onClick={() => setShowMemoryBox(false)}
                        className="text-white/20 hover:text-white"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    
                    <div className="space-y-6">
                      <div>
                        <button 
                          onClick={exportData}
                          className="w-full py-3 rounded-xl bg-fate-cyan/10 border border-fate-cyan/30 text-fate-cyan font-display font-bold hover:bg-fate-cyan/20 transition-colors flex items-center justify-center gap-2"
                        >
                          <Archive size={16} />
                          封存这份记忆
                        </button>
                        <p className="text-[10px] text-white/40 mt-2 leading-relaxed font-serif italic">
                          将当前的人脉图谱导出为文件，您可以安全地收藏在本地。
                        </p>
                      </div>
                      
                      <div className="pt-4 border-t border-white/5">
                        <label className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-white/60 font-display font-bold hover:bg-white/10 transition-colors flex items-center justify-center gap-2 cursor-pointer">
                          <RefreshCw size={16} />
                          唤醒旧日时光
                          <input type="file" accept=".json" onChange={importData} className="hidden" />
                        </label>
                      </div>

                      <div className="pt-4 border-t border-white/5">
                        <button 
                          onClick={() => setShowClearConfirm(true)}
                          className="w-full py-3 rounded-xl bg-fate-red/5 border border-fate-red/20 text-fate-red/60 font-display font-bold hover:bg-fate-red/10 hover:text-fate-red transition-all flex items-center justify-center gap-2"
                        >
                          <Trash2 size={16} />
                          暂忘这段缘分
                        </button>
                        <p className="text-[9px] text-fate-red/40 mt-2 leading-relaxed font-serif italic text-center">
                          此操作将永久清空所有关系数据，不可撤销。
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button 
              onClick={triggerSelfAnalysis}
              className="glass p-2 rounded-full hover:text-fate-cyan transition-colors"
              title="灵魂镜像：AI 剖析自我"
            >
              <Eye size={20} />
            </button>

            <button 
              onClick={() => setShowProfileEdit(true)}
              className="glass p-2 rounded-full hover:text-fate-cyan transition-colors"
            >
              <User size={20} />
            </button>
            <button 
              onClick={handleLogout}
              className="glass p-2 rounded-full hover:text-fate-red transition-colors"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        {/* Left Panel: Profile & Network */}
        <div className="absolute left-6 top-24 bottom-6 w-80 z-20 flex flex-col gap-6 pointer-events-none">
          {/* User Card */}
          <motion.div 
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="glass p-6 rounded-3xl pointer-events-auto glow-cyan"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-fate-cyan/10 flex items-center justify-center text-fate-cyan border border-fate-cyan/20 animate-breathe">
                <Globe size={24} />
              </div>
              <div>
                <h2 className="text-display text-xl font-bold">{profile?.name || '未命名'}</h2>
                <p className="micro-label text-fate-cyan">{profile?.personalityType || '待设定'}</p>
              </div>
            </div>
            <p className="text-xs text-white/50 line-clamp-2 italic mb-4">
              “{profile?.description || '在星尘中寻找连接的意义...'}”
            </p>
            <div className="flex items-center gap-2 mt-4">
              <button 
                onClick={triggerNetworkAnalysis}
                disabled={isAnalyzingNetwork}
                className="flex-1 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] uppercase tracking-widest hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
              >
                {isAnalyzingNetwork ? <RefreshCw size={12} className="animate-spin" /> : <Activity size={12} />}
                宏观分析
              </button>
              <button 
                onClick={() => setShowDiary(true)}
                className="flex-1 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] uppercase tracking-widest hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
              >
                <Book size={12} />
                因缘日记
              </button>
            </div>
          </motion.div>

          {/* Relationship List */}
          <motion.div 
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="glass flex-1 rounded-3xl p-6 flex flex-col pointer-events-auto glow-magenta"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="micro-label">关系星图</h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-fate-magenta">{relationships.length}/50</span>
                <button 
                  onClick={() => setShowAddRel(true)}
                  className="text-fate-cyan hover:scale-110 transition-transform"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {activeRelationships.map(rel => {
                const tier = getRelationshipTier(rel);
                return (
                  <button
                    key={rel.id}
                    onClick={() => setSelectedRelId(rel.id)}
                    className={`w-full p-3 rounded-2xl flex items-center justify-between transition-all group ${selectedRelId === rel.id ? 'bg-fate-cyan/10 border border-fate-cyan/30 glow-cyan' : 'hover:bg-white/5 border border-transparent'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-1.5 h-1.5 rounded-full animate-breathe ${
                        rel.type.includes('伴侣') || rel.type.includes('爱') ? 'bg-fate-red shadow-[0_0_8px_rgba(255,45,85,0.5)]' : 
                        rel.type.includes('家') || rel.type.includes('亲') ? 'bg-fate-violet shadow-[0_0_8px_rgba(138,43,226,0.5)]' : 'bg-fate-cyan shadow-[0_0_8px_rgba(0,242,255,0.5)]'
                      }`} />
                      <div className="text-left">
                        <div className="text-sm font-display font-medium group-hover:text-fate-cyan transition-colors">{rel.targetName}</div>
                        <div className="micro-label !text-[8px] !opacity-30">{tier}</div>
                      </div>
                    </div>
                    <ChevronRight size={14} className={`transition-transform ${selectedRelId === rel.id ? 'text-fate-cyan translate-x-1' : 'text-white/20'}`} />
                  </button>
                );
              })}
              {activeRelationships.length === 0 && (
                <div className="text-center py-12 text-white/20 text-xs italic">
                  点击 + 开始构建你的关系宇宙
                </div>
              )}

              {/* Dormant Relationships Section */}
              {dormantRelationships.length > 0 && (
                <div className="mt-8 pt-8 border-t border-white/5">
                  <div className="flex items-center gap-2 mb-4 text-white/30">
                    <RefreshCw size={14} />
                    <h3 className="text-xs uppercase tracking-widest">沉睡列表 ({dormantRelationships.length})</h3>
                  </div>
                  <div className="space-y-2">
                    {dormantRelationships.map(rel => (
                      <div 
                        key={rel.id}
                        className="glass p-3 rounded-xl flex justify-between items-center hover:bg-white/5 transition-colors group"
                      >
                        <div 
                          className="flex-1 cursor-pointer"
                          onClick={() => handleNodeClick(rel.id)}
                        >
                          <span className="text-sm text-white/40 group-hover:text-white/60">{rel.targetName}</span>
                          <span className="text-[10px] text-white/20 italic ml-2">已沉睡</span>
                        </div>
                        <button 
                          onClick={() => reactivateRelationship(rel.id)}
                          className="text-[10px] text-fate-cyan opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                        >
                          <RefreshCw size={10} /> 唤醒
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Right Panel: Relationship Detail */}
        <AnimatePresence>
          {selectedRel && (
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="absolute right-0 top-0 h-full w-full md:w-[450px] glass z-30 flex flex-col glow-cyan"
            >
              <div className="p-8 pb-4 flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="micro-label !text-fate-cyan">{selectedRel.type}</span>
                    {selectedRel.isDormant ? (
                      <span className="text-[8px] px-1.5 py-0.5 rounded-sm bg-white/5 text-white/30 border border-white/10 font-mono">
                        DORMANT
                      </span>
                    ) : (
                      <span className={`text-[8px] px-1.5 py-0.5 rounded-sm font-mono ${
                        getRelationshipTier(selectedRel) === '核心圈' ? 'bg-fate-red/20 text-fate-red' :
                        getRelationshipTier(selectedRel) === '次核心' ? 'bg-fate-cyan/20 text-fate-cyan' :
                        'bg-white/5 text-white/30'
                      }`}>
                        {getRelationshipTier(selectedRel).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <h2 className="text-display text-4xl font-bold mb-2 animate-slam">{selectedRel.targetName}</h2>
                  <div className="flex items-center gap-2">
                    <span className="micro-label">{selectedRel.personalityType}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {selectedRel.isDormant && (
                    <button 
                      onClick={() => reactivateRelationship(selectedRel.id)}
                      className="glass px-3 py-1 rounded-full text-[10px] text-fate-cyan hover:bg-fate-cyan/20 transition-colors flex items-center gap-1"
                    >
                      <RefreshCw size={12} /> 唤醒星辰
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      setLinkingNodes([selectedRel.id]);
                      setSelectedRelId(null);
                    }}
                    className="glass p-2 rounded-full hover:text-fate-cyan transition-colors"
                    title="建立与其他节点的连结"
                  >
                    <Link2 size={18} />
                  </button>
                  <button 
                    onClick={() => setShowEditRel(true)}
                    className="glass p-2 rounded-full hover:text-fate-cyan transition-colors"
                    title="修改原始设定"
                  >
                    <Edit size={18} />
                  </button>
                  <button 
                    onClick={() => setSelectedRelId(null)}
                    className="text-white/30 hover:text-white"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 pt-4 space-y-8 custom-scrollbar">
                {/* Status & AI Analysis */}
                <section>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="micro-label flex items-center gap-2">
                      <TrendingUp size={14} /> 宿命分析
                    </h3>
                    <button 
                      onClick={() => triggerRelAnalysis(selectedRel)}
                      disabled={isLoading}
                      className="text-[10px] text-fate-cyan hover:underline flex items-center gap-1 font-mono uppercase tracking-widest"
                    >
                      {isLoading ? <RefreshCw size={10} className="animate-spin" /> : <Sparkles size={10} />}
                      RE-DIAGNOSE
                    </button>
                  </div>
                  <div className="bg-white/5 rounded-2xl p-6 border border-white/10 min-h-[100px] glow-cyan">
                    {selectedRel.lastAnalysis ? (
                      <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-headings:font-display prose-headings:text-fate-cyan prose-p:font-serif prose-p:italic">
                        <ReactMarkdown>{selectedRel.lastAnalysis}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-white/30 text-xs italic text-center py-8 font-serif">点击“重新诊断”开启 AI 深度分析</p>
                    )}
                  </div>
                </section>

                {/* Event Logs */}
                <section>
                  <h3 className="micro-label mb-4 flex items-center gap-2">
                    <MessageSquare size={14} /> 事件日志
                  </h3>
                  <div className="space-y-4">
                    <div className="relative">
                      <input 
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.currentTarget.value) {
                            addEvent(e.currentTarget.value);
                            e.currentTarget.value = '';
                          }
                        }}
                        placeholder="记录新的因缘事件..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm focus:outline-none focus:border-fate-cyan transition-colors pr-12 font-serif italic"
                      />
                      <Send size={16} className="absolute right-4 top-4 text-white/20" />
                    </div>
                    <div className="space-y-3">
                      {events.map(ev => (
                        <div key={ev.id} className="p-4 rounded-xl bg-white/5 border border-white/5 text-sm hover:border-white/10 transition-colors">
                          <p className="text-white/80 mb-2 font-serif italic">{ev.content}</p>
                          <p className="text-[10px] text-white/20 font-mono">
                            {ev.timestamp?.toDate().toLocaleString() || 'Just now'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
                
                {/* Delete Action */}
                <section className="pt-8 border-t border-white/10">
                  <button 
                    onClick={async () => {
                      if (confirm('确定要从宇宙中移除这段关系吗？')) {
                        try {
                          await deleteDoc(doc(db, 'users', user.uid, 'relationships', selectedRel.id));
                          setSelectedRelId(null);
                        } catch (err) {
                          handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/relationships/${selectedRel.id}`);
                        }
                      }
                    }}
                    className="text-fate-red/50 hover:text-fate-red micro-label flex items-center gap-2 transition-colors"
                  >
                    <Trash2 size={12} /> 移除关系
                  </button>
                </section>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Network Analysis Modal */}
        <AnimatePresence>
          {networkAnalysis && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="w-full max-w-2xl glass p-8 rounded-3xl relative max-h-[80vh] overflow-y-auto custom-scrollbar"
              >
                <button 
                  onClick={() => setNetworkAnalysis(null)}
                  className="absolute top-6 right-6 text-white/50 hover:text-white"
                >
                  <X size={24} />
                </button>
                <h2 className="text-3xl font-serif mb-8 flex items-center gap-3">
                  <Globe className="text-fate-cyan" /> 宇宙宏观分析
                </h2>
                <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-headings:font-serif prose-headings:text-fate-cyan">
                  <ReactMarkdown>{networkAnalysis}</ReactMarkdown>
                </div>
              </motion.div>
              <div className="absolute inset-0 bg-black/80 -z-10" onClick={() => setNetworkAnalysis(null)} />
            </div>
          )}
        </AnimatePresence>

        {/* Clear Confirmation Modal */}
        <AnimatePresence>
          {showClearConfirm && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowClearConfirm(false)}
                className="absolute inset-0 bg-black/80 backdrop-blur-md"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="relative w-full max-w-md glass p-8 rounded-3xl border-fate-red/30 glow-magenta"
              >
                <div className="flex items-center gap-4 mb-6 text-fate-red">
                  <AlertTriangle size={32} />
                  <h2 className="text-2xl font-display font-bold">确定要暂忘一切吗？</h2>
                </div>
                
                <p className="text-white/70 mb-8 leading-relaxed">
                  这个操作将永久移除您在粒子宇宙中建立的所有关系、事件记录和因缘连结。
                  <br /><br />
                  <span className="text-fate-red font-bold">此操作不可撤销。</span> 建议您在执行前先使用“封存这份记忆”功能导出备份。
                </p>
                
                <div className="flex gap-4">
                  <button 
                    onClick={() => setShowClearConfirm(false)}
                    className="flex-1 py-4 rounded-2xl bg-white/5 border border-white/10 font-bold hover:bg-white/10 transition-colors"
                  >
                    保留记忆
                  </button>
                  <button 
                    onClick={clearAllData}
                    className="flex-1 py-4 rounded-2xl bg-fate-red/20 border border-fate-red/40 text-fate-red font-bold hover:bg-fate-red/30 transition-colors"
                  >
                    彻底清空
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Welcome Instructions Modal */}
        <AnimatePresence>
          {showWelcome && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="w-full max-w-lg glass p-8 rounded-3xl border-fate-cyan/30"
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-fate-cyan/20 rounded-lg text-fate-cyan">
                    <Info size={24} />
                  </div>
                  <h2 className="text-2xl font-serif">欢迎来到关系宇宙</h2>
                </div>
                
                <div className="space-y-4 text-sm text-white/70 leading-relaxed">
                  <p>这是一个基于 AI 的人际关系演化模拟系统。在这里，每一个灵魂都是一颗星辰。</p>
                  
                  <div className="space-y-2">
                    <h3 className="text-white font-medium">🌌 宇宙法则：</h3>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li><span className="text-fate-cyan">记录上限</span>：系统最多同时维护 50 位活跃关系。</li>
                      <li><span className="text-fate-cyan">关系分层</span>：系统会自动根据提及频率划分圈层。
                        <ul className="ml-6 mt-1 space-y-1 opacity-80">
                          <li>• 核心圈 (5人)：最常被提及的灵魂伴侣。</li>
                          <li>• 次核心 (8人)：重要的社交节点。</li>
                          <li>• 外围重要：低频但关键的关系纽带。</li>
                        </ul>
                      </li>
                      <li><span className="text-fate-cyan">沉睡机制</span>：当记录超过 50 人时，最不活跃的关系将进入“沉睡列表”。</li>
                    </ul>
                  </div>
                  
                  <p className="italic text-xs text-white/40 mt-6">“因缘际会，皆有定数。请开始你的记录。”</p>
                </div>

                <button 
                  onClick={() => setShowWelcome(false)}
                  className="w-full mt-8 bg-fate-cyan text-black font-bold py-3 rounded-xl hover:bg-white transition-colors"
                >
                  开启宇宙
                </button>
              </motion.div>
              <div className="absolute inset-0 bg-black/80 backdrop-blur-md -z-10" />
            </div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {showProfileEdit && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="w-full max-w-md glass p-8 rounded-3xl"
              >
                <h2 className="text-2xl font-serif mb-8">设定你的星核</h2>
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-white/50 mb-2">你的称呼</label>
                    <input 
                      defaultValue={profile?.name}
                      id="prof-name"
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-fate-cyan transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-white/50 mb-2">性格指纹 (如 MBTI)</label>
                    <input 
                      defaultValue={profile?.personalityType}
                      id="prof-type"
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-fate-cyan transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-white/50 mb-2">核心描述</label>
                    <textarea 
                      defaultValue={profile?.description}
                      id="prof-desc"
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-fate-cyan transition-colors h-24 resize-none"
                    />
                  </div>
                  <button
                    onClick={() => {
                      const name = (document.getElementById('prof-name') as HTMLInputElement).value;
                      const type = (document.getElementById('prof-type') as HTMLInputElement).value;
                      const desc = (document.getElementById('prof-desc') as HTMLTextAreaElement).value;
                      saveProfile({ name, personalityType: type, description: desc });
                    }}
                    disabled={isLoading}
                    className={`w-full bg-fate-cyan text-black font-bold py-4 rounded-xl hover:bg-white transition-colors flex items-center justify-center gap-2 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isLoading ? <RefreshCw size={20} className="animate-spin" /> : <Activity size={20} />}
                    {isLoading ? '正在同步星核...' : '同步星核'}
                  </button>
                </div>
              </motion.div>
              <div className="absolute inset-0 bg-black/80 -z-10" onClick={() => profile && setShowProfileEdit(false)} />
            </div>
          )}
        </AnimatePresence>

        {/* Diary Modal */}
        <AnimatePresence>
          {showDiary && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="w-full max-w-2xl glass p-8 rounded-3xl relative max-h-[80vh] flex flex-col"
              >
                <button 
                  onClick={() => setShowDiary(false)}
                  className="absolute top-6 right-6 text-white/50 hover:text-white"
                >
                  <X size={24} />
                </button>
                <h2 className="text-display text-4xl font-bold mb-8 flex items-center gap-3 animate-slam">
                  <Book className="text-fate-cyan" /> 因缘日记
                </h2>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-8 pr-4">
                  <div className="space-y-4">
                    <textarea 
                      id="diary-input"
                      placeholder="今天发生了什么？提到的人名和关系将被自动识别并记录..."
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-6 text-sm focus:outline-none focus:border-fate-cyan transition-colors h-40 resize-none font-serif italic"
                    />
                    <button 
                      onClick={() => {
                        const content = (document.getElementById('diary-input') as HTMLTextAreaElement).value;
                        if (content) {
                          addDiaryEntry(content);
                          (document.getElementById('diary-input') as HTMLTextAreaElement).value = '';
                        }
                      }}
                      disabled={isLoading}
                      className="w-full bg-fate-cyan text-black font-bold py-4 rounded-xl hover:bg-white transition-colors flex items-center justify-center gap-2 glow-cyan"
                    >
                      {isLoading ? <RefreshCw size={18} className="animate-spin" /> : <Send size={18} />}
                      记录并同步宇宙
                    </button>
                  </div>

                  <div className="space-y-4">
                    <h3 className="micro-label">过往记录</h3>
                    {diaries.map(d => (
                      <div key={d.id} className={`p-6 rounded-2xl border transition-all hover:scale-[1.01] ${d.isPathTaken ? 'bg-fate-cyan/10 border-fate-cyan/30 shadow-[0_0_20px_rgba(0,242,255,0.1)]' : 'bg-white/5 border-white/5'}`}>
                        {d.isPathTaken && (
                          <div className="flex items-center gap-2 mb-3">
                            <Sparkles size={14} className="text-fate-cyan" />
                            <span className="micro-label !text-fate-cyan">来时路 · 灵魂蜕变</span>
                          </div>
                        )}
                        <div className={`text-sm leading-relaxed ${d.isPathTaken ? 'text-white font-serif italic text-lg' : 'text-white/80 font-serif italic'}`}>
                          <ReactMarkdown>{d.content}</ReactMarkdown>
                        </div>
                        <div className="flex justify-between items-center mt-4 pt-4 border-t border-white/5">
                          <div className="flex gap-2">
                            {d.mentions?.map(mid => {
                              const rel = relationships.find(r => r.id === mid);
                              return rel ? (
                                <span key={mid} className="text-[10px] px-2 py-1 rounded-full bg-fate-cyan/10 text-fate-cyan border border-fate-cyan/20 font-mono">
                                  @{rel.targetName.toUpperCase()}
                                </span>
                              ) : null;
                            })}
                          </div>
                          <span className="text-[10px] text-white/20 font-mono">
                            {d.timestamp?.toDate().toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
              <div className="absolute inset-0 bg-black/80 -z-10" onClick={() => setShowDiary(false)} />
            </div>
          )}
        </AnimatePresence>

        {/* Connection Perception Popup */}
        <AnimatePresence>
          {selectedConnection && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="w-full max-w-md glass p-8 rounded-3xl relative"
              >
                <button 
                  onClick={() => setSelectedConnection(null)}
                  className="absolute top-6 right-6 text-white/50 hover:text-white"
                >
                  <X size={24} />
                </button>
                
                {(() => {
                  const nodeA = relationships.find(r => r.id === selectedConnection.nodeA);
                  const nodeB = relationships.find(r => r.id === selectedConnection.nodeB);
                  return (
                    <div className="space-y-8">
                      <h2 className="text-2xl font-serif text-center flex items-center justify-center gap-4">
                        <span className="text-fate-cyan">{nodeA?.targetName}</span>
                        <Link2 className="text-white/20" />
                        <span className="text-fate-violet">{nodeB?.targetName}</span>
                      </h2>
                      
                      <div className="space-y-6">
                        <div className="p-4 rounded-2xl bg-fate-cyan/5 border border-fate-cyan/20">
                          <label className="block text-[10px] uppercase tracking-widest text-fate-cyan mb-2">{nodeA?.targetName} 的看法</label>
                          <p className="text-sm italic text-white/80">“{selectedConnection.perceptionAtoB}”</p>
                        </div>
                        
                        <div className="p-4 rounded-2xl bg-fate-violet/5 border border-fate-violet/20 text-right">
                          <label className="block text-[10px] uppercase tracking-widest text-fate-violet mb-2">{nodeB?.targetName} 的看法</label>
                          <p className="text-sm italic text-white/80">“{selectedConnection.perceptionBtoA}”</p>
                        </div>
                      </div>

                      <button 
                        onClick={async () => {
                          if (confirm('确定要移除这段连结吗？')) {
                            try {
                              await deleteDoc(doc(db, 'users', user.uid, 'connections', selectedConnection.id));
                              setSelectedConnection(null);
                            } catch (err) {
                              handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/connections/${selectedConnection.id}`);
                            }
                          }
                        }}
                        className="w-full py-2 text-[10px] uppercase tracking-widest text-fate-red/50 hover:text-fate-red transition-colors"
                      >
                        移除连结
                      </button>
                    </div>
                  );
                })()}
              </motion.div>
              <div className="absolute inset-0 bg-black/80 -z-10" onClick={() => setSelectedConnection(null)} />
            </div>
          )}
        </AnimatePresence>

        {/* Add Relationship Modal */}
        <AnimatePresence>
          {showAddRel && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="w-full max-w-lg glass p-8 rounded-3xl max-h-[90vh] overflow-y-auto custom-scrollbar"
              >
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-serif">引入新的因缘</h2>
                  <button onClick={() => setShowAddRel(false)} className="text-white/30 hover:text-white">
                    <X size={20} />
                  </button>
                </div>
                
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-white/50 mb-2">对方称呼</label>
                      <input id="rel-name" className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-fate-cyan transition-colors" placeholder="如：张三" />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-white/50 mb-2">性格指纹</label>
                      <input id="rel-type" className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-fate-cyan transition-colors" placeholder="如：INTJ / 热情" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-white/50 mb-2">关系类型 (手动输入)</label>
                    <input id="rel-nature" className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-fate-cyan transition-colors" placeholder="如：灵魂伴侣、多年损友、导师..." />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-white/50 mb-2">关系背景描述</label>
                    <textarea 
                      id="rel-desc" 
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-fate-cyan transition-colors h-24 resize-none" 
                      placeholder="描述你们是如何相识的，或者目前的关系基调..."
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-white/50 mb-2 flex justify-between">
                      <span>导入聊天记录 (可选)</span>
                      <span className="text-fate-cyan/50 lowercase">AI 将基于此进行深度因缘分析</span>
                    </label>
                    <textarea 
                      id="rel-chat" 
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-fate-cyan transition-colors h-32 resize-none text-xs font-mono" 
                      placeholder="粘贴聊天记录片段..."
                    />
                  </div>

                  <button
                    onClick={() => {
                      const targetName = (document.getElementById('rel-name') as HTMLInputElement).value;
                      const personalityType = (document.getElementById('rel-type') as HTMLInputElement).value;
                      const type = (document.getElementById('rel-nature') as HTMLInputElement).value;
                      const description = (document.getElementById('rel-desc') as HTMLTextAreaElement).value;
                      const chatHistory = (document.getElementById('rel-chat') as HTMLTextAreaElement).value;
                      
                      if (!targetName || !type) {
                        alert('请填写对方称呼和关系类型');
                        return;
                      }

                      addRelationship({ 
                        targetName, 
                        personalityType, 
                        type, 
                        description, 
                        chatHistory 
                      });
                    }}
                    className="w-full bg-fate-cyan text-black font-bold py-4 rounded-xl hover:bg-white transition-colors flex items-center justify-center gap-2"
                  >
                    <Sparkles size={18} /> 建立连结并开启因缘
                  </button>
                </div>
              </motion.div>
              <div className="absolute inset-0 bg-black/80 -z-10" onClick={() => setShowAddRel(false)} />
            </div>
          )}
        </AnimatePresence>

        {/* Self Analysis Modal */}
        <AnimatePresence>
          {showSelfAnalysis && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="w-full max-w-2xl glass p-8 rounded-3xl max-h-[90vh] overflow-y-auto custom-scrollbar"
              >
                <div className="flex justify-between items-center mb-8">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-fate-cyan/20 rounded-lg text-fate-cyan">
                      <Eye size={24} />
                    </div>
                    <div>
                      <h2 className="text-2xl font-serif">灵魂镜像</h2>
                      <p className="text-[10px] text-white/30 uppercase tracking-widest">AI 对你的深度灵魂剖析</p>
                    </div>
                  </div>
                  <button onClick={() => setShowSelfAnalysis(false)} className="text-white/30 hover:text-white">
                    <X size={20} />
                  </button>
                </div>

                {isAnalyzingSelf ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <RefreshCw className="animate-spin text-fate-cyan mb-4" size={32} />
                    <p className="text-sm text-white/50 font-serif italic">正在凝视深渊，映照你的灵魂...</p>
                  </div>
                ) : (
                  <div className="prose prose-invert max-w-none">
                    <div className="markdown-body">
                      <ReactMarkdown>{selfAnalysis || '镜像模糊，无法映照出你的灵魂。'}</ReactMarkdown>
                    </div>
                    <div className="mt-12 pt-8 border-t border-white/10 text-center">
                      <p className="text-[10px] text-white/20 italic">“知人者智，自知者明。”</p>
                    </div>
                  </div>
                )}
              </motion.div>
              <div className="absolute inset-0 bg-black/90 -z-10 backdrop-blur-sm" onClick={() => setShowSelfAnalysis(false)} />
            </div>
          )}
        </AnimatePresence>

        {/* Edit Relationship Modal */}
        <AnimatePresence>
          {showEditRel && selectedRel && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="w-full max-w-lg glass p-8 rounded-3xl max-h-[90vh] overflow-y-auto custom-scrollbar"
              >
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-serif">修改因缘设定</h2>
                  <button onClick={() => setShowEditRel(false)} className="text-white/30 hover:text-white">
                    <X size={20} />
                  </button>
                </div>
                
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-white/50 mb-2">对方称呼</label>
                      <input 
                        id="edit-rel-name" 
                        defaultValue={selectedRel.targetName}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-fate-cyan transition-colors" 
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-white/50 mb-2">性格指纹</label>
                      <input 
                        id="edit-rel-type" 
                        defaultValue={selectedRel.personalityType}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-fate-cyan transition-colors" 
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-white/50 mb-2">关系类型</label>
                    <input 
                      id="edit-rel-nature" 
                      defaultValue={selectedRel.type}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-fate-cyan transition-colors" 
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-white/50 mb-2">关系背景描述</label>
                    <textarea 
                      id="edit-rel-desc" 
                      defaultValue={selectedRel.description}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-fate-cyan transition-colors h-24 resize-none" 
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-white/50 mb-2">聊天记录</label>
                    <textarea 
                      id="edit-rel-chat" 
                      defaultValue={selectedRel.chatHistory}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-fate-cyan transition-colors h-32 resize-none text-xs font-mono" 
                    />
                  </div>

                  <button
                    onClick={() => {
                      const targetName = (document.getElementById('edit-rel-name') as HTMLInputElement).value;
                      const personalityType = (document.getElementById('edit-rel-type') as HTMLInputElement).value;
                      const type = (document.getElementById('edit-rel-nature') as HTMLInputElement).value;
                      const description = (document.getElementById('edit-rel-desc') as HTMLTextAreaElement).value;
                      const chatHistory = (document.getElementById('edit-rel-chat') as HTMLTextAreaElement).value;
                      
                      updateRelationship(selectedRel.id, { 
                        targetName, 
                        personalityType, 
                        type, 
                        description, 
                        chatHistory 
                      });
                    }}
                    className="w-full bg-fate-cyan text-black font-bold py-4 rounded-xl hover:bg-white transition-colors"
                  >
                    保存修改
                  </button>
                </div>
              </motion.div>
              <div className="absolute inset-0 bg-black/80 -z-10" onClick={() => setShowEditRel(false)} />
            </div>
          )}
        </AnimatePresence>

        {/* Footer Stats */}
        <footer className="absolute bottom-6 left-6 z-20 pointer-events-none">
          <div className="flex items-center gap-4 text-white/30 text-[10px] font-mono tracking-widest uppercase">
            <span>Cosmos Sync: Active</span>
            <span className="w-1 h-1 bg-white/30 rounded-full" />
            <span>Entities: {relationships.length + 1}</span>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}
