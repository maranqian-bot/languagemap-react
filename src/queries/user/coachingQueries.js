import { useMutation, useQuery } from '@tanstack/react-query';
import { coachingService } from '../../api/user/coachingService';

// 기존 학습 세션(sessionId)을 기준으로 AI 코칭 진입 화면에 필요한 데이터를 조회
export function useCoachingEntryQuery(sessionId, options = {}) {
    return useQuery({
        ...options,
        queryKey: ['coachingEntry', sessionId],
        queryFn: () => coachingService.getCoachingEntry(sessionId),
        enabled: Boolean(sessionId) && (options.enabled ?? true),
    });
}

// AI 코칭 전체 흐름을 시작
export function useStartCoachingFlowMutation() {
    return useMutation({
        mutationFn: coachingService.startCoachingFlow,
    });
}

// 선택한 옵션을 기준으로 AI 코칭 대화 스크립트를 준비
export function usePrepareCoachingScriptMutation() {
    return useMutation({
        mutationFn: coachingService.prepareCoachingScript,
    });
}

// 준비된 스크립트를 기반으로 실제 AI 대화를 시작
export function useStartConversationMutation() {
    return useMutation({
        mutationFn: coachingService.startConversation,
    });
}

// 사용자의 음성 파일을 업로드하고 STT, 발음 평가, AI 응답 처리를 요청
export function useProcessUserSpeechMutation() {
    return useMutation({
        mutationFn: ({ coachingSessionId, audioFile }) =>
            coachingService.processUserSpeech(coachingSessionId, audioFile),
    });
}

// AI 코칭 대화를 종료하고 최종 피드백 생성을 요청
export function useFinishConversationMutation() {
    return useMutation({
        mutationFn: coachingService.finishConversation,
    });
}

// AI 코칭 세션(coachingSessionId)에 저장된 대화 메시지 목록을 조회
export function useCoachingMessagesQuery(coachingSessionId) {
    return useQuery({
        queryKey: ['coachingMessages', coachingSessionId],
        queryFn: () => coachingService.getCoachingMessages(coachingSessionId),
        enabled: Boolean(coachingSessionId),
    });
}
