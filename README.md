# Mapingo React Frontend

지도 기반 AI 영어 학습 서비스 Mapingo의 React 기반 프론트엔드 서버입니다.

사용자 UI 및 관리자 화면, 지도 기반 학습 인터페이스를 담당합니다.

![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6-F7DF1E?style=for-the-badge&logo=javascript)
![Vite](https://img.shields.io/badge/Vite-Build_Tool-646CFF?style=for-the-badge&logo=vite)
![React Router](https://img.shields.io/badge/React_Router-Routing-CA4245?style=for-the-badge&logo=reactrouter)
![Zustand](https://img.shields.io/badge/Zustand-State_Management-443E38?style=for-the-badge)
![React Query](https://img.shields.io/badge/React_Query-Server_State-FF4154?style=for-the-badge&logo=reactquery)
![Axios](https://img.shields.io/badge/Axios-HTTP_Client-5A29E4?style=for-the-badge&logo=axios)
![SockJS](https://img.shields.io/badge/SockJS-WebSocket-010101?style=for-the-badge)
![STOMP](https://img.shields.io/badge/STOMP-Realtime_Message-010101?style=for-the-badge)
![LocalForage](https://img.shields.io/badge/LocalForage-Storage-3B82F6?style=for-the-badge)
![ESLint](https://img.shields.io/badge/ESLint-Code_Quality-4B32C3?style=for-the-badge&logo=eslint)
![Notion](https://img.shields.io/badge/Notion-Documentation-000000?style=for-the-badge&logo=notion)

---

## 주요 기능(Main Domains)

- 로그인 도메인
- 구독 도메인
- 소셜 도메인
- 즐겨찾기 도메인
- 채팅 도메인
- 학습 목표 도메인
- 랭킹 도메인
- AI 지도 학습 도메인
- AI 음성 학습 도메인
- 학습 영상 추천 도메인

---

## 레포지토리 구조(Repository Structure)

| Repository | Address |
|---|---|
| language-react | [React Frontend](https://github.com/soo97/languagemap-react.git) |
| language-spring | [Spring Boot API Server](https://github.com/soo97/languagemap-spring.git) |
| language-fastapi | [FastAPI AI Server](https://github.com/soo97/languagemap-FastAPI.git) |

---

## AWS 아키텍쳐(AWS Architecture)

<img width="1627" height="967" alt="image" src="https://github.com/user-attachments/assets/dd1442bd-0caa-44cd-bc66-b9f72e199ea5" />


---

## 프로젝트 규칙(Project Rules)

- 컴포넌트 역할 단위 분리
- API 호출 로직은 service 계층 분리
- 상태 관리는 Zustand Store 기반으로 통일
- 공통 스타일 및 컴포넌트 재사용 지향
- 페이지 / 컴포넌트 네이밍 규칙 통일
- 작업 중 변경 사항은 Notion에 기록
- Backend API 응답 형식에 맞춰 데이터 처리
- 필요 없는 props drilling 지양
- 비즈니스 로직과 UI 로직 분리

---

## 브랜치 구조(Branch Structure)

| Branch | Description |
|---|---|
| main | 운영 가능한 안정 버전 |
| feature/* | 기능 개발 브랜치 |
| fix/* | 기능 수정 브랜치 |

---

## 커밋 규칙(Commit Rules)

```text
feat: 기능 추가
fix: 버그 수정
style: 코드 포맷/스타일 변경
chore: 기타 설정
design: UI/UX 변경
rename: 이름 변경
remove: 삭제
refactor: 리팩토링
build: 빌드 변경
```

---

## 기술 스택(Tech Stack)

| Category | Stack |
|---|---|
| Frontend | React 19, JavaScript |
| Build Tool | Vite |
| Routing | React Router DOM |
| State Management | Zustand |
| Server State Management | TanStack React Query |
| HTTP Client | Axios |
| Realtime Communication | SockJS, STOMP |
| Local Storage | LocalForage |
| Code Quality | ESLint |
| Collaboration Tools | GitHub, Notion, Swagger, ERDCloud |
---

## 폴더 구조(Folder Structure)

```text
languagemap-react/
├─ public/        
├─ docs/             
├─ src/
│  ├─ api/          
│  ├─ components/     
│  ├─ data/          
│  ├─ hooks/         
│  ├─ mocks/         
│  ├─ pages/          
│  ├─ queries/ 
│  ├─ store/         
│  ├─ styles/     
│  ├─ utils/        
│  ├─ App.jsx         
│  ├─ index.css      
│  └─ main.jsx  
```

---

## 네이밍 컨벤션(Naming Convention)

| Layer | Rule |
|---|---|
| Component | PascalCase |
| Page | ~Page |
| Hook | use~ |
| Store | use~Store |
| Service | ~Service |
| Style | camelCase |

---

## API 컨벤션(API Convention)

- REST API 기반 통신
- Axios 기반 API 호출 처리
- Backend 공통 응답 형식 사용
- API 호출 로직 분리
- 비동기 처리 통일

---

## 상태 관리(State Management)

- Zustand 기반 전역 상태 관리
- 사용자 인증 상태 관리
- 지도 상태 관리
- 채팅 상태 관리
- 사용자 학습 상태 관리

---

## 인증(Authentication)

- JWT 기반 로그인 처리
- Access Token 기반 사용자 인증 유지
- OAuth2 기반 Google 로그인 지원

---

## 환경 변수(Environment Variables)

env 설정

```env
VITE_GOOGLE_MAP_API_KEY=
VITE_API_BASE_URL=
VITE_FASTAPI_BASE_URL=
VITE_CHAT_SOCKET_URL=
```

---

## 보안 규칙(Secret Rules)

- .env 파일 GitHub 업로드 금지
- 환경 변수 로컬 개별 관리
- API Key 외부 노출 금지

---

## 레포지토리 복제(Clone Repository)

```bash
git clone https://github.com/soo97/languagemap-react.git
```

## 팀원 및 역할(Team Members)

| 이름 | 역할 | 기능 구현 |
|---|---|---|
| 임수현 | 팀장 | (추가 예정) |
| 고은별 | 팀원 | // |
| 마은재 | 팀원 | // |
| 이가연 | 팀원 | // |
| 이현재 | 팀원 | // |
| 홍순찬 | 팀원 | (사용자)/(관리자) 지도 기반 영어 학습 기능 구현 |
