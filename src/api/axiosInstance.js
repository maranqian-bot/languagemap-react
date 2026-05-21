import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const axiosInstance = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true,
});

// 요청 인터셉터 - 모든 요청에 accessToken 자동 첨부
axiosInstance.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('accessToken');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// 재발급 중복 방지 플래그
let isRefreshing = false;
// 재발급 대기 중인 요청들
let waitingQueue = [];


// 응답 인터셉터 - 401 시 자동 재발급
axiosInstance.interceptors.response.use(
    (response) => {
        if (response.config?.rawResponse) {
            return response;
        }

        return response.data;
    },
    async (error) => {
        const originalRequest = error.config;

        // 401이고 재시도 안 한 요청만 처리
        if (error.response?.status === 401 && !originalRequest._retry) {

            // 재발급 중이면 대기열에 추가
            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    waitingQueue.push({ resolve, reject });
                }).then((token) => {
                    originalRequest.headers.Authorization = `Bearer ${token}`;
                    return axiosInstance(originalRequest);
                }).catch((err) => Promise.reject(err));
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                // refreshToken(Cookie)으로 재발급 요청
                const response = await axios.post(
                    `${API_BASE_URL}/api/auth/tokens`,
                    {},
                    { withCredentials: true }
                );

                const newAccessToken = response.data.data.accessToken;
                localStorage.setItem('accessToken', newAccessToken);

                // 대기 중인 요청들에 새 토큰 전달
                processQueue(null, newAccessToken);

                // 원래 요청 재시도
                originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                return axiosInstance(originalRequest);

            } catch (refreshError) {
                // 재발급 실패 → 로그아웃 처리
                processQueue(refreshError, null);
                localStorage.removeItem('accessToken');
                window.location.href = '/login';
                return Promise.reject(refreshError);

            } finally {
                isRefreshing = false;
            }
        }

        // 403
        if (error.response?.status === 403) {
            alert('접근 권한이 없습니다.');
        }

        // 500
        if (error.response?.status === 500) {
            alert('서버 오류가 발생했습니다.');
        }

        return Promise.reject(error);
    }
);

export default axiosInstance;
