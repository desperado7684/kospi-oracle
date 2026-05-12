# 🔮 KOSPI ORACLE — GitHub Actions 완전 자동화 버전

> PC를 꺼도 GitHub이 알아서 10분마다 지수 수집, 30분마다 AI 예측 생성

---

## 🏗️ 구조

```
[GitHub Actions 스케줄러]
    ↓ 매 10분 자동 실행
[scripts/collect.js]
    ├─ Yahoo Finance → 13개 지수 수집
    ├─ Claude AI → KOSPI/KOSDAQ 예측 (30분마다)
    └─ public/data.json 업데이트 (자동 커밋)
         ↓
[GitHub Pages] → 정적 사이트로 배포
    ↓
[브라우저] → data.json 읽어서 표시
           (서버 제로, 비용 제로)
```

---

## 🚀 최초 설정 (딱 한 번만)

### 1단계: GitHub 저장소 생성

1. https://github.com 로그인
2. **New repository** 클릭
3. Repository name: `kospi-oracle`
4. **Public** 선택 (Pages 무료 사용)
5. Create repository

---

### 2단계: 이 폴더를 업로드

```bash
# Git이 설치된 경우
cd kospi-oracle-gha
git init
git add .
git commit -m "초기 설정"
git branch -M main
git remote add origin https://github.com/[내_아이디]/kospi-oracle.git
git push -u origin main
```

**Git 미설치 시:** GitHub 웹에서 파일을 직접 드래그&드롭으로 업로드

---

### 3단계: API 키 등록 (1회만)

1. GitHub 저장소 → **Settings** 탭
2. 왼쪽 메뉴 → **Secrets and variables** → **Actions**
3. **New repository secret** 클릭
4. Name: `ANTHROPIC_API_KEY`
5. Secret: `sk-ant-api03-...` (실제 키 입력)
6. **Add secret** 저장

---

### 4단계: GitHub Pages 활성화

1. 저장소 → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: **main** / **/ (root)** 선택 → **public** 폴더 선택
   - Branch: `main`, Folder: `/public`
4. **Save**

약 1~2분 후 `https://[내_아이디].github.io/kospi-oracle` 접속 가능

---

### 5단계: 첫 수동 실행

1. 저장소 → **Actions** 탭
2. **KOSPI Oracle — 자동 수집 및 AI 예측** 클릭
3. **Run workflow** → **Run workflow**
4. 약 1분 후 완료 → 사이트에서 데이터 확인

---

## ⚙️ 자동화 주기 변경

`.github/workflows/collect.yml` 수정:

```yaml
schedule:
  - cron: '*/10 * * * *'   # 10분마다 (기본)
  - cron: '*/5 * * * *'    # 5분마다
  - cron: '0 * * * *'      # 1시간마다
```

> ⚠️ GitHub Actions 무료 계정: 월 2,000분 제공
> 10분마다 = 하루 144회 × 1분 = 월 약 4,320분 → 유료 전환 가능
> **권장: 장 시간(9:00~16:00 KST)에만 실행**

---

## ⏰ 장 시간만 실행하는 고급 설정

```yaml
schedule:
  # 한국 주식 장 시간 (KST 09:00-15:30) = UTC 00:00-06:30
  - cron: '*/10 0-6 * * 1-5'   # 평일 UTC 0~6시 (KST 9~15시)
  # 미국 장 시간 (ET 09:30-16:00) = UTC 13:30-20:00
  - cron: '*/10 13-20 * * 1-5' # 평일 UTC 13~20시
```

→ 월 약 1,440분 소비 (무료 한도 내)

---

## 💰 비용

| 항목 | 비용 |
|------|------|
| GitHub Actions | 무료 (월 2,000분) |
| GitHub Pages | 무료 |
| Yahoo Finance API | 무료 (비공식) |
| Claude API (예측) | 약 $0.003~0.006/회 × 48회/일 ≈ **$0.15~0.30/일** |

---

## 📡 생성되는 파일 구조

`public/data.json`:
```json
{
  "updatedAt": "2026-05-12T08:30:00Z",
  "kstTime": "2026-05-12 17:30:00 KST",
  "market": {
    "^GSPC": { "name": "S&P 500", "price": 5600, "change": 0.82, ... },
    ...
  },
  "history": {
    "^GSPC": [{ "t": 1715000000000, "price": 5598, "change": 0.78 }, ...]
  },
  "prediction": {
    "structured": {
      "kospi": { "direction": "UP", "confidence": 73, "brief": "..." },
      "kosdaq": { "direction": "UP", "confidence": 68, "brief": "..." },
      "key_factors": ["나스닥 강세", "달러 약세", "반도체 상승"],
      "risk_level": "LOW"
    },
    "fullText": "상세 분석 텍스트...",
    "generatedAt": "2026-05-12T08:00:00Z"
  }
}
```
