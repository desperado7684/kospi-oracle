// ══════════════════════════════════════════════════════
//  KOSPI ORACLE — 자동 수집 + AI 예측 스크립트
//  GitHub Actions에서 10분마다 자동 실행됨
//  결과는 ../public/data.json 에 저장
// ══════════════════════════════════════════════════════
import fetch from 'node-fetch';
import fs    from 'fs/promises';
import path  from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT    = path.join(__dirname, '../public/data.json');

// ── 추적 지수 목록 ──────────────────────────────────────
const INDICES = [
  { symbol: '^GSPC',     name: 'S&P 500',     region: 'us'  },
  { symbol: '^IXIC',     name: 'NASDAQ',       region: 'us'  },
  { symbol: '^DJI',      name: 'DOW JONES',    region: 'us'  },
  { symbol: '^N225',     name: '닛케이 225',   region: 'jp'  },
  { symbol: '000001.SS', name: '상하이 종합',  region: 'cn'  },
  { symbol: '^HSI',      name: '항셍지수',     region: 'cn'  },
  { symbol: '^GDAXI',    name: 'DAX',          region: 'eu'  },
  { symbol: '^FTSE',     name: 'FTSE 100',     region: 'eu'  },
  { symbol: 'DX-Y.NYB',  name: '달러 인덱스', region: 'com' },
  { symbol: 'CL=F',      name: 'WTI 유가',    region: 'com' },
  { symbol: 'GC=F',      name: '금 선물',      region: 'com' },
  { symbol: '^KS11',     name: 'KOSPI',        region: 'kr'  },
  { symbol: '^KQ11',     name: 'KOSDAQ',       region: 'kr'  },
];

// ── Yahoo Finance 수집 ───────────────────────────────────
async function fetchIndex(symbol) {
  // Yahoo Finance는 두 엔드포인트를 번갈아 사용 (안정성)
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=10m&range=1d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=10m&range=1d`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; KOSPI-Oracle-Bot/1.0)',
          'Accept':     'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) continue;
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) continue;

      const meta   = result.meta;
      const price  = meta.regularMarketPrice ?? 0;
      const prev   = meta.previousClose ?? meta.chartPreviousClose ?? price;
      const change = prev !== 0 ? ((price - prev) / prev) * 100 : 0;

      // 스파크라인용 종가 배열 (최근 20개 포인트)
      const rawCloses = result.indicators?.quote?.[0]?.close ?? [];
      const closes    = rawCloses
        .filter(v => v !== null && v !== undefined)
        .slice(-20)
        .map(v => parseFloat(v.toFixed(4)));

      return {
        symbol,
        price:       parseFloat(price.toFixed(4)),
        prev:        parseFloat(prev.toFixed(4)),
        change:      parseFloat(change.toFixed(3)),
        currency:    meta.currency ?? 'USD',
        marketState: meta.marketState ?? 'UNKNOWN',
        dayHigh:     meta.regularMarketDayHigh ?? null,
        dayLow:      meta.regularMarketDayLow  ?? null,
        closes,
        ok: true,
      };
    } catch (e) {
      // 다음 URL 시도
    }
  }

  console.warn(`  ⚠️  ${symbol} 수집 실패`);
  return { symbol, ok: false };
}

// ── Claude AI 예측 ───────────────────────────────────────
async function runAIPrediction(marketData) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('  ⚠️  ANTHROPIC_API_KEY 없음 — AI 예측 스킵');
    return null;
  }

  // 비한국 지수만 AI에게 전달
  const snapshot = Object.entries(marketData)
    .filter(([, d]) => d.region !== 'kr' && d.ok)
    .map(([, d]) => `- ${d.name}: ${d.change >= 0 ? '+' : ''}${d.change.toFixed(2)}% (${d.price} ${d.currency}, ${d.marketState})`)
    .join('\n');

  const kstHour = new Date(Date.now() + 9 * 3600000).getUTCHours();

  console.log('  🤖 Claude AI 예측 시작...');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: `당신은 글로벌 거시경제 전문가이자 한국 주식시장 수석 애널리스트입니다.
제공된 글로벌 지수 데이터를 분석하여 KOSPI와 KOSDAQ의 방향성을 예측합니다.

반드시 응답 맨 앞에 아래 JSON 블록을 포함하고, 이후 상세 분석을 한국어로 작성하세요:

<PREDICTION>
{
  "kospi": {
    "direction": "UP" | "DOWN" | "NEUTRAL",
    "confidence": 0-100,
    "range_low": (예상 하단 변동률, 소수),
    "range_high": (예상 상단 변동률, 소수),
    "brief": "50자 이내 핵심 요약"
  },
  "kosdaq": {
    "direction": "UP" | "DOWN" | "NEUTRAL",
    "confidence": 0-100,
    "range_low": (예상 하단 변동률, 소수),
    "range_high": (예상 상단 변동률, 소수),
    "brief": "50자 이내 핵심 요약"
  },
  "key_factors": ["핵심요인1", "핵심요인2", "핵심요인3"],
  "risk_level": "LOW" | "MEDIUM" | "HIGH",
  "sectors": {
    "positive": ["수혜섹터1", "수혜섹터2"],
    "negative": ["주의섹터1"]
  }
}
</PREDICTION>`,
        messages: [{
          role: 'user',
          content: `현재 한국시간 ${kstHour}시 기준, 글로벌 주요 지수 현황:\n\n${snapshot}\n\n위 데이터를 종합 분석하여 KOSPI/KOSDAQ 방향성 예측 및 상세 투자 시사점을 제공해주세요. 시장 간 상관관계, 선행 지표 특성, 시간대 효과를 모두 고려하세요.`,
        }],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API ${res.status}: ${err}`);
    }

    const json = await res.json();
    const text = json.content?.[0]?.text ?? '';

    // JSON 파싱
    const match = text.match(/<PREDICTION>([\s\S]*?)<\/PREDICTION>/);
    let structured = null;
    if (match) {
      try { structured = JSON.parse(match[1].trim()); }
      catch (e) { console.warn('  ⚠️  예측 JSON 파싱 실패:', e.message); }
    }

    const fullText = text.replace(/<PREDICTION>[\s\S]*?<\/PREDICTION>/, '').trim();
    console.log(`  ✅ AI 예측 완료 — KOSPI: ${structured?.kospi?.direction ?? '?'}, KOSDAQ: ${structured?.kosdaq?.direction ?? '?'}`);

    return { structured, fullText, generatedAt: new Date().toISOString() };
  } catch (e) {
    console.error('  ❌ AI 예측 오류:', e.message);
    return null;
  }
}

// ── 기존 data.json 히스토리 로드 ─────────────────────────
async function loadExistingData() {
  try {
    const raw = await fs.readFile(OUTPUT, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { history: {} }; // 첫 실행
  }
}

// ── 메인 실행 ────────────────────────────────────────────
async function main() {
  const startTime = Date.now();
  console.log(`\n🚀 KOSPI ORACLE 수집 시작 — ${new Date().toISOString()}`);

  // 1) 기존 데이터 로드 (히스토리 유지)
  const existing = await loadExistingData();

  // 2) 전체 지수 병렬 수집
  console.log(`\n📡 ${INDICES.length}개 지수 수집 중...`);
  const results = await Promise.allSettled(
    INDICES.map(idx => fetchIndex(idx.symbol))
  );

  const marketData = {};
  let successCount = 0;

  results.forEach((res, i) => {
    const idx = INDICES[i];
    if (res.status === 'fulfilled' && res.value?.ok) {
      marketData[idx.symbol] = { ...res.value, name: idx.name, region: idx.region };
      successCount++;
      const d = res.value;
      console.log(`  ✓ ${idx.name.padEnd(12)} ${d.change >= 0 ? '+' : ''}${d.change.toFixed(2)}% (${d.price})`);
    } else {
      console.log(`  ✗ ${idx.name}`);
    }
  });

  console.log(`\n  → ${successCount}/${INDICES.length}개 성공`);

  // 3) 히스토리 업데이트 (지수별 최근 144개 = 하루치 10분봉)
  if (!existing.history) existing.history = {};
  const now = Date.now();
  Object.entries(marketData).forEach(([sym, d]) => {
    if (!existing.history[sym]) existing.history[sym] = [];
    existing.history[sym].push({ t: now, price: d.price, change: d.change });
    if (existing.history[sym].length > 144) existing.history[sym].shift();
  });

  // 4) AI 예측 (30분마다 또는 첫 실행)
  let prediction = existing.prediction ?? null;
  const lastPredTime = prediction?.generatedAt ? new Date(prediction.generatedAt).getTime() : 0;
  const shouldPredict = (now - lastPredTime) > 30 * 60 * 1000; // 30분 경과

  if (shouldPredict) {
    console.log('\n🤖 AI 예측 실행 조건 충족...');
    prediction = await runAIPrediction(marketData);
  } else {
    const minAgo = Math.round((now - lastPredTime) / 60000);
    console.log(`\n⏭️  AI 예측 스킵 (마지막 예측 ${minAgo}분 전, 30분 주기)`);
  }

  // 5) 최종 data.json 저장
  const output = {
    updatedAt:   new Date().toISOString(),
    kstTime:     new Date(now + 9 * 3600000).toISOString().replace('T', ' ').slice(0, 19) + ' KST',
    successCount,
    totalCount:  INDICES.length,
    market:      marketData,
    history:     existing.history,
    prediction,
    meta: {
      elapsedMs:   Date.now() - startTime,
      runBy:       'GitHub Actions',
    },
  };

  await fs.writeFile(OUTPUT, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n✅ data.json 저장 완료 (${Date.now() - startTime}ms)`);
  console.log(`   경로: public/data.json\n`);
}

main().catch(e => {
  console.error('💥 치명적 오류:', e);
  process.exit(1);
});
