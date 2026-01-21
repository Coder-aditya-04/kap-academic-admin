
import React, { useState, useEffect, useRef } from 'react';
import * as faceapi from 'face-api.js';
import { supabase } from '../supabaseClient';
import { LogIn, LogOut, Loader, ScanFace, CheckCircle2, AlertTriangle, XCircle, UserCheck, UserX } from 'lucide-react';

const ScannerPage = () => {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceMatcher, setFaceMatcher] = useState(null);
  const [lastLog, setLastLog] = useState(null);
  const [detectingName, setDetectingName] = useState(null);

  const videoRef = useRef();
  const canvasRef = useRef();
  const isProcessing = useRef(false);
  const lastScanTime = useRef({});

  // 1. SETUP MODELS
  useEffect(() => {
    const loadResources = async () => {
      try {
        const MODEL_URL = `${import.meta.env.BASE_URL}models`;
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);

        const { data: students } = await supabase
          .from('students')
          .select('full_name, roll_number, face_descriptor')
          .not('face_descriptor', 'is', null);

        if (students && students.length > 0) {
          const labeledDescriptors = students.map(student => {
            const descriptor = new Float32Array(JSON.parse(student.face_descriptor));
            return new faceapi.LabeledFaceDescriptors(`${student.full_name} (${student.roll_number})`, [descriptor]);
          });
          setFaceMatcher(new faceapi.FaceMatcher(labeledDescriptors, 0.45));
          setModelsLoaded(true);
        }
      } catch (err) {
        console.error(err);
      }
    };
    loadResources();
  }, []);

  // 2. START CAMERA (High Resolution)
  useEffect(() => {
    if (modelsLoaded) {
      navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } })
        .then(stream => { if (videoRef.current) videoRef.current.srcObject = stream; })
        .catch(err => console.error(err));
    }
  }, [modelsLoaded]);

  // Sound Effect
  const playBeep = () => {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);

    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.5);
    oscillator.stop(audioCtx.currentTime + 0.5);
  };

  // 3. LOGIC
  const logAttendance = async (label) => {
    if (isProcessing.current) return;

    const name = label.split(' (')[0];
    const rollNumber = label.split(' (')[1]?.replace(')', '');

    // Cooldown 30 Mins
    const now = Date.now();
    const lastTime = lastScanTime.current[rollNumber];
    if (lastTime && (now - lastTime < 30 * 60 * 1000)) return;

    isProcessing.current = true;

    try {
      const today = new Date().toISOString().split('T')[0];

      const { data: logs } = await supabase
        .from('gate_logs')
        .select('*')
        .eq('roll_number', rollNumber)
        .eq('date_only', today)
        .order('scan_time', { ascending: false })
        .limit(1);

      let newStatus = 'IN';
      if (logs && logs.length > 0 && logs[0].scan_type === 'IN') newStatus = 'OUT';

      await supabase.from('gate_logs').insert([{
        roll_number: rollNumber,
        student_name: name,
        scan_type: newStatus
      }]);

      setLastLog({ name, status: newStatus, time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) });

      // Play Sound
      playBeep();

      lastScanTime.current[rollNumber] = now;

      setTimeout(() => {
        setLastLog(null);
        isProcessing.current = false;
        setDetectingName(null);
      }, 4000);

    } catch (err) {
      console.error(err);
      isProcessing.current = false;
    }
  };

  // 4. DETECTION LOOP
  const handleVideoOnPlay = () => {
    setInterval(async () => {
      if (videoRef.current && canvasRef.current && faceMatcher && !isProcessing.current) {

        const detection = await faceapi.detectSingleFace(videoRef.current).withFaceLandmarks().withFaceDescriptor();

        // Match Dimensions
        const displaySize = { width: videoRef.current.videoWidth, height: videoRef.current.videoHeight };
        faceapi.matchDimensions(canvasRef.current, displaySize);
        canvasRef.current.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

        if (detection) {
          const resized = faceapi.resizeResults(detection, displaySize);
          const result = faceMatcher.findBestMatch(resized.descriptor);

          if (result.label !== 'unknown') {
            // Draw Fancy Box
            const box = resized.detection.box;
            const ctx = canvasRef.current.getContext('2d');

            // Neon Green Box Effect
            ctx.strokeStyle = '#00ff9d';
            ctx.lineWidth = 3;
            ctx.shadowBlur = 10;
            ctx.shadowColor = "#00ff9d";
            ctx.strokeRect(box.x, box.y, box.width, box.height);

            setDetectingName(result.label.split(' (')[0]);
            logAttendance(result.label);
          } else {
            // Draw White Box (Unknown)
            const box = resized.detection.box;
            const ctx = canvasRef.current.getContext('2d');
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.shadowBlur = 0;
            ctx.strokeRect(box.x, box.y, box.width, box.height);
            setDetectingName(null);
          }
        } else {
          setDetectingName(null);
        }
      }
    }, 200); // Check faster (200ms) for smoother UI
  };

  // Determine UI State
  const getUIState = () => {
    if (!lastLog) return 'IDLE';
    return lastLog.status === 'IN' ? 'SUCCESS_IN' : 'SUCCESS_OUT';
  };

  const uiState = getUIState();

  return (
    <div className="h-screen bg-neutral-950 flex items-center justify-center font-sans overflow-hidden p-6">

      {/* MAXIMIZED CONTAINER */}
      <div className={`relative w-full max-w-[1200px] h-[85vh] rounded-[2.5rem] overflow-hidden shadow-2xl transition-all duration-500 border-4 ${uiState === 'SUCCESS_IN' ? 'border-green-500 shadow-[0_0_50px_rgba(34,197,94,0.3)]' :
        uiState === 'SUCCESS_OUT' ? 'border-red-500 shadow-[0_0_50px_rgba(239,68,68,0.3)]' :
          'border-white/10'
        }`}>

        <div className="flex h-full flex-col md:flex-row">

          {/* LEFT: CAMERA - Maximized */}
          <div className="relative flex-1 bg-black overflow-hidden group">

            {/* Camera Status */}
            <div className="absolute top-6 left-6 z-20 flex gap-3">
              <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${modelsLoaded ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-yellow-500'}`}></div>
                <span className="text-white/90 text-xs font-bold tracking-wider">{modelsLoaded ? "SYSTEM ONLINE" : "INITIALIZING..."}</span>
              </div>
            </div>

            <video
              ref={videoRef}
              autoPlay muted
              onPlay={handleVideoOnPlay}
              className="w-full h-full object-cover transform scale-x-[-1] filter brightness-110 contrast-110 saturate-110"
            />
            <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full transform scale-x-[-1]" />

            {/* Scanning Overlay */}
            {!lastLog && (
              <div className="absolute inset-0 border-[1px] border-white/5 pointer-events-none flex items-center justify-center">
                <div className="w-[80%] h-[80%] border border-white/20 rounded-3xl relative">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white/50 rounded-tl-xl"></div>
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white/50 rounded-tr-xl"></div>
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white/50 rounded-bl-xl"></div>
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white/50 rounded-br-xl"></div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: INTERACTIVE TAB PANEL */}
          <div className={`w-full md:w-[450px] transition-colors duration-500 flex flex-col justify-center p-10 relative overflow-hidden ${uiState === 'SUCCESS_IN' ? 'bg-green-600' :
            uiState === 'SUCCESS_OUT' ? 'bg-red-600' :
              'bg-neutral-900 border-l border-white/5'
            }`}>

            {/* Default State */}
            {uiState === 'IDLE' && (
              <div className="text-center animate-fade-in">
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-white/10">
                  <ScanFace className="w-10 h-10 text-white/50" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-3">Smart Gate</h2>
                <p className="text-neutral-400 text-lg">
                  Please look at the camera.<br />
                  <span className="text-sm opacity-60">Scanning for student face...</span>
                </p>
                <div className="mt-12 flex justify-center gap-2">
                  <div className="w-2 h-2 bg-white/20 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-white/20 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                  <div className="w-2 h-2 bg-white/20 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                </div>
              </div>
            )}

            {/* SUCCESS: ENTRY (GREEN) */}
            {uiState === 'SUCCESS_IN' && (
              <div className="text-center text-white animate-fade-in-up">
                <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl">
                  <CheckCircle2 className="w-12 h-12 text-green-600" />
                </div>
                <div className="inline-block bg-black/20 px-4 py-1.5 rounded-full text-xs font-bold tracking-widest mb-4">PUNCH IN</div>
                <h1 className="text-4xl font-black mb-2 leading-tight">{lastLog.name}</h1>
                <p className="text-green-100 text-lg font-medium opacity-90">Welcome to Campus!</p>
                <div className="mt-8 text-6xl font-mono font-bold opacity-40 tracking-tighter mix-blend-overlay">
                  {lastLog.time}
                </div>
              </div>
            )}

            {/* SUCCESS: EXIT (RED) */}
            {uiState === 'SUCCESS_OUT' && (
              <div className="text-center text-white animate-fade-in-up">
                <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl">
                  <LogOut className="w-12 h-12 text-red-600 ml-1" />
                </div>
                <div className="inline-block bg-black/20 px-4 py-1.5 rounded-full text-xs font-bold tracking-widest mb-4">PUNCH OUT</div>
                <h1 className="text-4xl font-black mb-2 leading-tight">{lastLog.name}</h1>
                <p className="text-red-100 text-lg font-medium opacity-90">Goodbye! See you later.</p>
                <div className="mt-8 text-6xl font-mono font-bold opacity-40 tracking-tighter mix-blend-overlay">
                  {lastLog.time}
                </div>
              </div>
            )}

            {/* LIVE FOOTER */}
            <div className={`absolute bottom-6 left-0 right-0 text-center text-xs font-bold tracking-widest uppercase ${uiState === 'IDLE' ? 'text-white/20' : 'text-white/40'
              }`}>
              KAP ACADEMY
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default ScannerPage;