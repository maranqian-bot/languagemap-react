import { useEffect, useRef, useState } from 'react';

const MIN_RECORDING_DURATION_MS = 500;
const MIN_AUDIO_BLOB_SIZE_BYTES = 4096;
const MIN_AUDIO_RMS_LEVEL = 0.015;
const MIN_AUDIO_PEAK_LEVEL = 0.08;
const AUDIO_BITS_PER_SECOND = 128000;
const RECORDING_TIMESLICE_MS = 250;
const SELECTED_MIC_STORAGE_KEY = 'coaching:selectedAudioInputDeviceId';
const VIRTUAL_MIC_KEYWORDS = ['virtual', 'filmage', 'blackhole', 'obs', 'aggregate', 'loopback'];

function isVirtualAudioInputLabel(label = '') {
    const normalizedLabel = label.toLowerCase();

    return VIRTUAL_MIC_KEYWORDS.some((keyword) => normalizedLabel.includes(keyword));
}

function findPreferredAudioInput(devices = []) {
    return devices.find((device) => !isVirtualAudioInputLabel(device.label)) ?? devices[0] ?? null;
}

function getStoredAudioInputDeviceId() {
    try {
        return localStorage.getItem(SELECTED_MIC_STORAGE_KEY) || '';
    } catch {
        return '';
    }
}

function storeAudioInputDeviceId(deviceId) {
    try {
        if (deviceId) {
            localStorage.setItem(SELECTED_MIC_STORAGE_KEY, deviceId);
        } else {
            localStorage.removeItem(SELECTED_MIC_STORAGE_KEY);
        }
    } catch {
        // localStorage may be unavailable in private or embedded browsers.
    }
}

// 브라우저 마이크 녹음 상태와 동작을 관리하는 Hook
export function useVoiceRecorder({ onRecorded, onError } = {}) {
    const [isRecording, setIsRecording] = useState(false);
    const [audioInputDevices, setAudioInputDevices] = useState([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState(getStoredAudioInputDeviceId);
    const [activeTrackLabel, setActiveTrackLabel] = useState('');
    const [deviceFallbackReason, setDeviceFallbackReason] = useState('');

    const mediaRecorderRef = useRef(null);
    const mediaStreamRef = useRef(null);
    const userSelectedDeviceRef = useRef(false);
    const deviceFallbackReasonRef = useRef('');
    const audioChunksRef = useRef([]);
    const chunkSizesRef = useRef([]);
    const recordingStartedAtRef = useRef(0);
    const stopTimerRef = useRef(null);
    const audioContextRef = useRef(null);
    const audioAnalyserFrameRef = useRef(null);
    const audioLevelStatsRef = useRef({
        sampleCount: 0,
        maxRms: 0,
        maxPeak: 0,
        rmsTotal: 0,
    });

    const resetAudioLevelStats = () => {
        audioLevelStatsRef.current = {
            sampleCount: 0,
            maxRms: 0,
            maxPeak: 0,
            rmsTotal: 0,
        };
    };

    const stopAudioLevelMonitoring = () => {
        if (audioAnalyserFrameRef.current) {
            cancelAnimationFrame(audioAnalyserFrameRef.current);
            audioAnalyserFrameRef.current = null;
        }

        audioContextRef.current?.close?.();
        audioContextRef.current = null;
    };

    const cleanupStream = () => {
        stopAudioLevelMonitoring();
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
    };

    const startAudioLevelMonitoring = (stream) => {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;

        if (!AudioContextClass) return;

        try {
            const audioContext = new AudioContextClass();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();

            analyser.fftSize = 2048;
            source.connect(analyser);
            audioContextRef.current = audioContext;

            const samples = new Uint8Array(analyser.fftSize);

            const sampleAudioLevel = () => {
                analyser.getByteTimeDomainData(samples);

                let squareTotal = 0;
                let peak = 0;

                samples.forEach((sample) => {
                    const normalized = Math.abs((sample - 128) / 128);
                    squareTotal += normalized * normalized;
                    peak = Math.max(peak, normalized);
                });

                const rms = Math.sqrt(squareTotal / samples.length);
                const stats = audioLevelStatsRef.current;

                stats.sampleCount += 1;
                stats.rmsTotal += rms;
                stats.maxRms = Math.max(stats.maxRms, rms);
                stats.maxPeak = Math.max(stats.maxPeak, peak);

                audioAnalyserFrameRef.current = requestAnimationFrame(sampleAudioLevel);
            };

            sampleAudioLevel();
        } catch (error) {
            console.warn('Audio level monitoring unavailable:', error);
        }
    };

    const hasAudibleInput = (stats) =>
        stats.sampleCount > 0 &&
        (stats.maxRms >= MIN_AUDIO_RMS_LEVEL || stats.maxPeak >= MIN_AUDIO_PEAK_LEVEL);

    const refreshAudioInputDevices = async () => {
        if (!navigator.mediaDevices?.enumerateDevices) return;

        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter((device) => device.kind === 'audioinput');

            setAudioInputDevices(audioInputs);
            setSelectedDeviceId((currentDeviceId) => {
                const storedDeviceId = getStoredAudioInputDeviceId();
                const storedDevice = audioInputs.find((device) => device.deviceId === storedDeviceId);
                const currentDevice = audioInputs.find((device) => device.deviceId === currentDeviceId);

                if (storedDevice) {
                    return storedDevice.deviceId;
                }

                if (
                    currentDevice &&
                    (userSelectedDeviceRef.current || !isVirtualAudioInputLabel(currentDevice.label))
                ) {
                    return currentDeviceId;
                }

                return findPreferredAudioInput(audioInputs)?.deviceId ?? '';
            });
            console.log('audio input devices refreshed:', {
                deviceCount: audioInputs.length,
                selectedDeviceId,
            });
        } catch (error) {
            console.warn('Audio input device enumeration failed:', error);
        }
    };

    useEffect(() => {
        refreshAudioInputDevices();

        navigator.mediaDevices?.addEventListener?.('devicechange', refreshAudioInputDevices);

        // 컴포넌트 종료 시 사용 중인 마이크 stream 정리
        return () => {
            navigator.mediaDevices?.removeEventListener?.('devicechange', refreshAudioInputDevices);

            if (stopTimerRef.current) {
                clearTimeout(stopTimerRef.current);
            }

            if (mediaRecorderRef.current?.state === 'recording') {
                mediaRecorderRef.current.stop();
            }

            cleanupStream();
        };
    }, []);

    const getSupportedMimeType = () => {
        const mimeTypes = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
        ];

        return mimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) || '';
    };

    // 마이크 권한 확인 후 녹음 시작
    const startRecording = async () => {
        try {
            if (!navigator.mediaDevices?.getUserMedia) {
                onError?.('현재 브라우저에서 마이크 녹음을 지원하지 않습니다.');
                return;
            }

            audioChunksRef.current = [];
            chunkSizesRef.current = [];
            resetAudioLevelStats();
            deviceFallbackReasonRef.current = '';
            setDeviceFallbackReason('');

            const baseAudioConstraints = {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            };

            let stream;
            const shouldUseExactDevice = Boolean(selectedDeviceId && audioInputDevices.length > 1);

            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: shouldUseExactDevice
                        ? {
                            ...baseAudioConstraints,
                            deviceId: { exact: selectedDeviceId },
                        }
                        : baseAudioConstraints,
                });
            } catch (error) {
                if (shouldUseExactDevice) {
                    const fallbackReason = `${error.name || 'DeviceError'}: ${error.message || 'selected device unavailable'}`;
                    deviceFallbackReasonRef.current = fallbackReason;
                    setDeviceFallbackReason(fallbackReason);
                    console.warn('Selected microphone unavailable. Falling back to default audio input.', {
                        selectedDeviceId,
                        fallbackReason,
                    });

                    stream = await navigator.mediaDevices.getUserMedia({
                        audio: baseAudioConstraints,
                    });
                } else {
                    throw error;
                }
            }

            mediaStreamRef.current = stream;
            refreshAudioInputDevices();

            startAudioLevelMonitoring(stream);

            const mimeType = getSupportedMimeType();
            const recorderOptions = {
                audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
            };

            if (mimeType) {
                recorderOptions.mimeType = mimeType;
            }

            let recorder;

            try {
                recorder = new MediaRecorder(stream, recorderOptions);
            } catch (error) {
                console.warn('MediaRecorder options fallback:', error);
                recorder = mimeType
                    ? new MediaRecorder(stream, { mimeType })
                    : new MediaRecorder(stream);
            }

            mediaRecorderRef.current = recorder;
            const trackDetails = stream.getAudioTracks().map((track) => ({
                label: track.label,
                enabled: track.enabled,
                muted: track.muted,
                readyState: track.readyState,
                settings: track.getSettings?.(),
            }));
            const trackLabel = trackDetails.map((track) => track.label).filter(Boolean).join(', ');

            setActiveTrackLabel(trackLabel);
            console.log('media recorder mimeType:', recorder.mimeType);
            console.log('media stream audio tracks:', {
                selectedDeviceId,
                deviceCount: audioInputDevices.length,
                fallbackReason: deviceFallbackReasonRef.current,
                tracks: trackDetails,
            });

            // 녹음 중 생성되는 음성 데이터를 임시 저장
            recorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                    chunkSizesRef.current.push(event.data.size);
                }
            };

            // 녹음 종료 후 음성 파일 생성 및 외부 콜백 전달
            recorder.onstop = async () => {
                try {
                    setIsRecording(false);

                    const recordingDurationMs = Date.now() - recordingStartedAtRef.current;
                    const audioLevelStats = audioLevelStatsRef.current;
                    const averageRms = audioLevelStats.sampleCount
                        ? audioLevelStats.rmsTotal / audioLevelStats.sampleCount
                        : 0;
                    const audioBlob = new Blob(audioChunksRef.current, {
                        type: recorder.mimeType || 'audio/webm',
                    });
                    const trackLabel = mediaStreamRef.current
                        ?.getAudioTracks()
                        .map((track) => track.label)
                        .filter(Boolean)
                        .join(', ') || 'unknown';

                    console.log('recorded audio summary:', {
                        selectedDeviceId,
                        deviceCount: audioInputDevices.length,
                        fallbackReason: deviceFallbackReasonRef.current,
                        durationMs: recordingDurationMs,
                        blobSize: audioBlob.size,
                        blobType: audioBlob.type,
                        chunkCount: chunkSizesRef.current.length,
                        trackLabel,
                        audioLevel: {
                            sampleCount: audioLevelStats.sampleCount,
                            maxRms: audioLevelStats.maxRms,
                            maxPeak: audioLevelStats.maxPeak,
                            averageRms,
                        },
                    });

                    cleanupStream();

                    mediaRecorderRef.current = null;
                    recordingStartedAtRef.current = 0;

                    if (audioBlob.size === 0) {
                        onError?.('녹음 파일이 비어 있습니다. 다시 녹음해주세요.');
                        return;
                    }

                    if (recordingDurationMs < MIN_RECORDING_DURATION_MS) {
                        onError?.('녹음 시간이 너무 짧습니다. 다시 녹음해주세요.');
                        return;
                    }

                    if (audioBlob.size < MIN_AUDIO_BLOB_SIZE_BYTES) {
                        console.warn('Audio blob is small. Uploading for server-side recognition anyway.', {
                            blobSize: audioBlob.size,
                            minBlobSize: MIN_AUDIO_BLOB_SIZE_BYTES,
                        });
                    }

                    if (!hasAudibleInput(audioLevelStats)) {
                        console.warn('Low or silent microphone input detected. Uploading for server-side recognition anyway.', {
                            sampleCount: audioLevelStats.sampleCount,
                            maxRms: audioLevelStats.maxRms,
                            maxPeak: audioLevelStats.maxPeak,
                        });
                    }

                    await onRecorded?.(audioBlob);
                } catch (error) {
                    console.error(error);
                    onError?.('녹음 파일 처리 중 오류가 발생했습니다.');
                } finally {
                    audioChunksRef.current = [];
                    chunkSizesRef.current = [];
                    resetAudioLevelStats();
                }
            };

            // 녹음 중 발생한 브라우저/장치 오류 처리
            recorder.onerror = (event) => {
                console.error('MediaRecorder error:', event.error);

                setIsRecording(false);
                cleanupStream();
                mediaRecorderRef.current = null;
                recordingStartedAtRef.current = 0;
                audioChunksRef.current = [];
                chunkSizesRef.current = [];
                resetAudioLevelStats();

                onError?.('녹음 중 오류가 발생했습니다. 다시 시도해주세요.');
            };

            recordingStartedAtRef.current = Date.now();
            recorder.start(RECORDING_TIMESLICE_MS);
            setIsRecording(true);
        } catch (error) {
            console.error(error);
            setIsRecording(false);
            cleanupStream();
            mediaRecorderRef.current = null;
            recordingStartedAtRef.current = 0;
            audioChunksRef.current = [];
            chunkSizesRef.current = [];
            resetAudioLevelStats();

            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                onError?.('마이크 권한이 거부되었습니다. 브라우저 주소창 왼쪽 아이콘에서 마이크 권한을 허용해주세요.');
                return;
            }

            if (error.name === 'NotFoundError') {
                onError?.('사용 가능한 마이크 장치를 찾을 수 없습니다.');
                return;
            }

            if (error.name === 'NotReadableError') {
                onError?.('다른 프로그램이 마이크를 사용 중입니다.');
                return;
            }

            if (error.name === 'SecurityError') {
                onError?.('보안 문제로 마이크에 접근할 수 없습니다.');
                return;
            }

            onError?.('마이크 접근 중 오류가 발생했습니다.');
        }
    };

    // 현재 녹음 중인 recorder를 안전하게 중지
    const stopRecording = () => {
        const recorder = mediaRecorderRef.current;

        if (!recorder || recorder.state === 'inactive') {
            setIsRecording(false);
            cleanupStream();
            return;
        }

        const elapsedMs = Date.now() - recordingStartedAtRef.current;
        const remainingMs = MIN_RECORDING_DURATION_MS - elapsedMs;

        if (remainingMs > 0) {
            if (!stopTimerRef.current) {
                stopTimerRef.current = setTimeout(() => {
                    stopTimerRef.current = null;
                    stopRecording();
                }, remainingMs);
            }

            return;
        }

        recorder.requestData();
        recorder.stop();
    };

    // 버튼 클릭 시 녹음 시작/중지 전환
    const toggleRecording = async () => {
        if (isRecording) {
            stopRecording();
            return;
        }

        await startRecording();
    };

    const selectAudioInputDevice = (deviceId) => {
        userSelectedDeviceRef.current = true;
        setSelectedDeviceId(deviceId);
        storeAudioInputDeviceId(deviceId);
        setActiveTrackLabel('');
        deviceFallbackReasonRef.current = '';
        setDeviceFallbackReason('');
    };

    return {
        isRecording,
        audioInputDevices,
        selectedDeviceId,
        setSelectedDeviceId: selectAudioInputDevice,
        activeTrackLabel,
        deviceFallbackReason,
        isVirtualMicrophoneSelected:
            isVirtualAudioInputLabel(activeTrackLabel) ||
            isVirtualAudioInputLabel(audioInputDevices.find((device) => device.deviceId === selectedDeviceId)?.label),
        startRecording,
        stopRecording,
        toggleRecording,
    };
}
