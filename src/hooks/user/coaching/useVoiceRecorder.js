import { useEffect, useRef, useState } from 'react';

const MIN_RECORDING_DURATION_MS = 1500;
const MIN_AUDIO_BLOB_SIZE_BYTES = 4096;

// 브라우저 마이크 녹음 상태와 동작을 관리하는 Hook
export function useVoiceRecorder({ onRecorded, onError } = {}) {
    const [isRecording, setIsRecording] = useState(false);

    const mediaRecorderRef = useRef(null);
    const mediaStreamRef = useRef(null);
    const audioChunksRef = useRef([]);
    const recordingStartedAtRef = useRef(0);
    const stopTimerRef = useRef(null);

    const cleanupStream = () => {
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
    };

    useEffect(() => {
        // 컴포넌트 종료 시 사용 중인 마이크 stream 정리
        return () => {
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

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            mediaStreamRef.current = stream;

            const mimeType = getSupportedMimeType();

            const recorder = mimeType
                ? new MediaRecorder(stream, { mimeType })
                : new MediaRecorder(stream);

            mediaRecorderRef.current = recorder;

            // 녹음 중 생성되는 음성 데이터를 임시 저장
            recorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            // 녹음 종료 후 음성 파일 생성 및 외부 콜백 전달
            recorder.onstop = async () => {
                try {
                    setIsRecording(false);

                    const recordingDurationMs = Date.now() - recordingStartedAtRef.current;
                    const audioBlob = new Blob(audioChunksRef.current, {
                        type: recorder.mimeType || 'audio/webm',
                    });

                    console.log('recorded audioBlob size:', audioBlob.size);
                    console.log('recorded audioBlob type:', audioBlob.type);
                    console.log('recorded audio duration ms:', recordingDurationMs);

                    cleanupStream();

                    mediaRecorderRef.current = null;
                    recordingStartedAtRef.current = 0;

                    if (audioBlob.size === 0) {
                        onError?.('녹음 파일이 비어 있습니다. 다시 녹음해주세요.');
                        return;
                    }

                    if (
                        recordingDurationMs < MIN_RECORDING_DURATION_MS ||
                        audioBlob.size < MIN_AUDIO_BLOB_SIZE_BYTES
                    ) {
                        onError?.('녹음 시간이 너무 짧거나 음성 파일이 정상적으로 생성되지 않았습니다. 2초 이상 말한 뒤 다시 시도해주세요.');
                        return;
                    }

                    await onRecorded?.(audioBlob);
                } catch (error) {
                    console.error(error);
                    onError?.('녹음 파일 처리 중 오류가 발생했습니다.');
                } finally {
                    audioChunksRef.current = [];
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

                onError?.('녹음 중 오류가 발생했습니다. 다시 시도해주세요.');
            };

            recordingStartedAtRef.current = Date.now();
            recorder.start(250);
            setIsRecording(true);
        } catch (error) {
            console.error(error);
            setIsRecording(false);
            cleanupStream();
            mediaRecorderRef.current = null;
            recordingStartedAtRef.current = 0;
            audioChunksRef.current = [];

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

    return {
        isRecording,
        startRecording,
        stopRecording,
        toggleRecording,
    };
}
