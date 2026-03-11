'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TrendingUp, TrendingDown, Minus, MoreVertical, Activity, X, Loader2, AlertCircle, Search, Sparkles } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';

interface StockData {
  id: string;
  name?: string;
  price?: string;
  changeRate?: string;
  changeText?: string;
  volIncr?: string;
  highLow?: string;
  high52?: string;
  error?: string;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  stock: StockData | null;
}

interface AIModalState {
  visible: boolean;
  type: 'analysis' | 'strategy' | null;
  stock: StockData | null;
  loading: boolean;
  result: string;
}

interface ChartModalState {
  visible: boolean;
  stock: StockData | null;
}

const STOCK_DICTIONARY: { [key: string]: string } = {
  "삼성전자": "005930",
  "SK하이닉스": "000660",
  "LG에너지솔루션": "373220",
  "삼성바이오로직스": "207940",
  "현대차": "005380",
  "기아": "000270",
  "셀트리온": "068270",
  "POSCO홀딩스": "005490",
  "NAVER": "035420",
  "카카오": "035720",
  "삼성물산": "028260",
  "KB금융": "105560",
  "신한지주": "055550",
  "LG화학": "051910",
  "삼성SDI": "006400",
  "현대모비스": "012330",
  "포스코퓨처엠": "003670",
  "LG전자": "066570",
  "카카오뱅크": "323410",
  "SK이노베이션": "096770",
  "에코프로비엠": "247540",
  "에코프로": "086520",
  "HLB": "028300",
  "알테오젠": "196170",
  "HPSP": "403870",
  "엔켐": "348370",
  "리노공업": "058470",
  "레인보우로보틱스": "277810",
  "솔브레인": "357780",
  "맥쿼리인프라": "088980",
  "KODEX 200": "069500",
  "TIGER 미국배당다우존스": "458730",
  "TIGER 미국S&P500": "360750",
  "TIGER 미국나스닥100": "133690",
  "KODEX 미국S&P500": "403020",
  "KODEX 미국나스닥100": "379810",
  "TIGER 미국배당+7%프리미엄다우존스": "458730", // Example mapping
  "SOL 미국배당다우존스": "446770",
  "ACE 미국S&P500": "360200",
  "ACE 미국나스닥100": "360210",
  "KODEX 배당성장": "270800",
  "TIGER 200": "102110",
  "ARIRANG 고배당주": "161510",
};

const ISA_PREMIUM_STOCKS = [
  "005930", // 삼성전자
  "088980", // 맥쿼리인프라
  "069500", // KODEX 200
  "458730", // TIGER 미국배당+7%프리미엄다우존스
  "360750", // TIGER 미국S&P500
  "133690", // TIGER 미국나스닥100
  "161510", // ARIRANG 고배당주
  "055550", // 신한지주
  "105560", // KB금융
  "005490", // POSCO홀딩스
];

export default function DashboardPage() {
  const [market, setMarket] = useState<'volume' | 'search' | 'gainers'>('volume');
  const [volumeData, setVolumeData] = useState<StockData[]>([]);
  const [searchData, setSearchData] = useState<StockData[]>([]);
  const [gainersData, setGainersData] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTimer, setRefreshTimer] = useState(60);
  const [globalError, setGlobalError] = useState<string | null>(null);
  
  const [searchCode, setSearchCode] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [briefingState, setBriefingState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [briefingResult, setBriefingResult] = useState('');
  const [briefingError, setBriefingError] = useState('');

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, stock: null });
  const [aiModal, setAiModal] = useState<AIModalState>({ visible: false, type: null, stock: null, loading: false, result: '' });
  const [chartModal, setChartModal] = useState<ChartModalState>({ visible: false, stock: null });
  const [columnWidths, setColumnWidths] = useState<{ [key: string]: number }>({
    name: 180,
    price: 120,
    changeRate: 120,
    volIncr: 150,
    highLow: 180,
    high52: 150,
  });

  const tableRef = useRef<HTMLTableElement>(null);
  const resizingCol = useRef<string | null>(null);
  const startX = useRef<number>(0);
  const startWidth = useRef<number>(0);

  const fetchAllData = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    else setIsRefreshing(true);
    
    setGlobalError(null);
    try {
      const [volRes, searchRes, gainRes] = await Promise.all([
        fetch('/api/stock?type=volume'),
        fetch('/api/stock?type=search'),
        fetch('/api/stock?type=gainers')
      ]);

      const [volData, sData, gData] = await Promise.all([
        volRes.json(),
        searchRes.json(),
        gainRes.json()
      ]);

      setVolumeData(Array.isArray(volData) ? volData : []);
      setSearchData(Array.isArray(sData) ? sData : []);
      setGainersData(Array.isArray(gData) ? gData : []);

      if (volData.error || sData.error || gData.error) {
        setGlobalError('일부 데이터를 가져오는 중 오류가 발생했습니다.');
      }
    } catch (error) {
      console.error('Error fetching all data:', error);
      if (!isBackground) setGlobalError('시장 데이터를 불러오는 중 네트워크 오류가 발생했습니다.');
    } finally {
      if (!isBackground) setLoading(false);
      else setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAllData();
    
    // Timer and Auto-refresh logic
    const intervalId = setInterval(() => {
      setRefreshTimer((prev) => {
        if (prev <= 1) {
          fetchAllData(true);
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  const getOverlapCount = (name: string | undefined) => {
    if (!name) return 1;
    let count = 0;
    if (volumeData.some(s => s.name === name)) count++;
    if (searchData.some(s => s.name === name)) count++;
    if (gainersData.some(s => s.name === name)) count++;
    return count;
  };

  const currentStocks = market === 'volume' ? volumeData : market === 'search' ? searchData : gainersData;

  const handleBriefing = async () => {
    setBriefingState('loading');
    setBriefingError('');
    try {
      // Hardcoded API Key for debugging environment variable issues
      const apiKey = "AlzaSyBCbNJouAV9K5_9C9MO54lsWHx1WOcrgOA";
      
      const ai = new GoogleGenAI({ apiKey });
      
      const systemInstruction = "너는 최고의 월스트리트 주식 애널리스트이자 데이트레이딩 전문가야. 간밤의 미국 증시와 글로벌 경제 뉴스를 분석해서 오늘 한국 시장에서 '단타'로 수익을 낼 수 있는 변동성 큰 섹터와 수급이 몰릴 만한 테마를 브리핑해 줘. 특히 거래량이 폭발하거나 외국인/기관 수급이 유입되는 종목들을 어떻게 공략해야 할지, 리스크 관리와 함께 가독성 좋은 글머리 기호 3~4줄로 명확하게 요약해 줘.";

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: "오늘의 글로벌 증시 브리핑을 요약해줘." }] }],
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.7,
        }
      });

      const text = response.text;

      if (!text) {
        throw new Error("AI가 응답을 생성했지만 내용이 비어있습니다.");
      }
      
      setBriefingResult(text);
      setBriefingState('done');
    } catch (error: any) {
      console.error('Briefing error:', error);
      setBriefingError(`${error.message || '브리핑 생성 중 오류가 발생했습니다.'} (상세: ${JSON.stringify(error, null, 2)})`);
      setBriefingState('error');
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let code = searchCode.trim();
    
    // Check if it's a name in the dictionary
    if (STOCK_DICTIONARY[code]) {
      code = STOCK_DICTIONARY[code];
    } else if (!/^\d{6}$/.test(code)) {
      alert('해당 종목을 찾을 수 없습니다. 정확한 종목명이나 코드를 입력해 주세요.');
      return;
    }

    if (currentStocks.some(s => s.id === code)) {
      alert('이미 목록에 있는 종목입니다.');
      setSearchCode('');
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(`/api/stock/search?code=${code}`);
      const data = await res.json();
      
      if (!res.ok || data.error) {
        alert('올바른 종목명이나 6자리 코드를 입력해 주세요.');
      } else {
        // Update the current active list
        if (market === 'volume') setVolumeData(prev => [data, ...prev]);
        else if (market === 'search') setSearchData(prev => [data, ...prev]);
        else setGainersData(prev => [data, ...prev]);
        
        setSearchCode('');
      }
    } catch (error) {
      console.error('Search error:', error);
      alert('검색 중 오류가 발생했습니다.');
    } finally {
      setIsSearching(false);
    }
  };

  // Handle outside click for context menu
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.visible) {
        setContextMenu({ ...contextMenu, visible: false });
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu]);

  // Resizable columns logic
  const handleMouseDown = (e: React.MouseEvent, colKey: string) => {
    resizingCol.current = colKey;
    startX.current = e.clientX;
    startWidth.current = columnWidths[colKey];
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!resizingCol.current) return;
    const diff = e.clientX - startX.current;
    const newWidth = Math.max(80, startWidth.current + diff);
    setColumnWidths((prev) => ({ ...prev, [resizingCol.current as string]: newWidth }));
  }, []);

  const handleMouseUp = useCallback(() => {
    resizingCol.current = null;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);

  const handleContextMenu = (e: React.MouseEvent, stock: StockData) => {
    e.preventDefault();
    if (stock.error) return; // Do not show context menu for errored rows
    
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      stock,
    });
  };

  const handleRowClick = (stock: StockData) => {
    if (stock.error) return;
    setChartModal({ visible: true, stock });
  };

  const handleAIAction = async (type: 'analysis' | 'strategy') => {
    const stock = contextMenu.stock;
    if (!stock) return;
    
    setContextMenu({ ...contextMenu, visible: false });
    setAiModal({ visible: true, type, stock, loading: true, result: '' });

    try {
      // Hardcoded API Key for debugging environment variable issues
      const apiKey = "AlzaSyBCbNJouAV9K5_9C9MO54lsWHx1WOcrgOA";
      
      const ai = new GoogleGenAI({ apiKey });
      const promptType = type === 'analysis' ? '종목 분석' : '투자 전략';
      const prompt = `당신은 전문 데이트레이더이자 수급 분석 전문가입니다. 다음 종목에 대해 단기적인 ${promptType}을 3문단 정도로 작성해주세요.
      
종목명: ${stock.name} (${stock.id})
현재가: ${stock.price}
등락률: ${stock.changeRate}
거래량 증가율: ${stock.volIncr}
당일 고가/저가: ${stock.highLow}
52주 최고가: ${stock.high52}

현재 수급 상황과 차트상의 변동성을 고려하여 단기 매매 관점에서의 대응 전략을 마크다운 형식으로 깔끔하게 정리해주세요.`;

      const response = await ai.models.generateContentStream({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      let fullText = '';
      for await (const chunk of response) {
        fullText += chunk.text;
        setAiModal(prev => ({ ...prev, result: fullText, loading: false }));
      }
    } catch (error: any) {
      console.error("AI Error:", error);
      setAiModal(prev => ({ 
        ...prev, 
        loading: false, 
        result: `AI 분석 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}\n\n상세 정보: ${JSON.stringify(error, null, 2)}` 
      }));
    }
  };

  const renderChangeRate = (rate: string, text: string) => {
    const isUp = text === 'RISING' || text === '상승' || rate.startsWith('+');
    const isDown = text === 'FALLING' || text === '하락' || rate.startsWith('-');
    
    return (
      <div className={`flex items-center gap-1 font-medium ${isUp ? 'text-red-500' : isDown ? 'text-blue-500' : 'text-gray-500'}`}>
        {isUp ? <TrendingUp className="w-4 h-4" /> : isDown ? <TrendingDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
        {rate}
      </div>
    );
  };

  const renderHighLowGauge = (stock: StockData) => {
    let percent = 50; // Default fallback
    let highStr = 'N/A';
    let lowStr = 'N/A';

    try {
      if (stock.highLow && stock.highLow !== 'N/A' && stock.highLow.includes('/')) {
        const parts = stock.highLow.split('/').map(s => s.trim().replace(/[^\d.]/g, ''));
        if (parts.length >= 2) {
          const high = parseFloat(parts[0]);
          const low = parseFloat(parts[1]);
          const current = parseFloat(stock.price?.replace(/[^\d.]/g, '') || '0');

          if (!isNaN(high) && !isNaN(low)) {
            highStr = high.toLocaleString();
            lowStr = low.toLocaleString();

            if (!isNaN(current) && high !== 0 && low !== 0) {
              if (Math.abs(high - low) < 0.0001) {
                percent = 100;
              } else {
                percent = ((current - low) / (high - low)) * 100;
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Gauge calculation error:", err);
    }

    percent = Math.max(0, Math.min(100, percent));
    // Color based on position: Red for high, Blue for low, Indigo for middle
    const markerColor = percent > 80 ? '#ef4444' : percent < 20 ? '#3b82f6' : '#6366f1';

    return (
      <div className="flex flex-col gap-1 min-w-[140px] py-1" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between text-[9px] text-neutral-400 font-mono font-medium">
          <span>{lowStr}</span>
          <span>{highStr}</span>
        </div>
        
        {/* 배경 바 (회색) - Pure HTML & Inline Styles for maximum reliability */}
        <div style={{ 
          position: 'relative', 
          width: '100%', 
          height: '6px', 
          backgroundColor: '#e2e8f0', 
          borderRadius: '3px', 
          margin: '6px 0',
          overflow: 'visible' 
        }}>
          {/* 현재가 점 (강조 색상) */}
          <div style={{ 
            position: 'absolute', 
            left: `${percent}%`, 
            top: '50%', 
            transform: 'translate(-50%, -50%)', 
            width: '12px', 
            height: '12px', 
            backgroundColor: markerColor, 
            borderRadius: '50%',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            transition: 'left 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            zIndex: 10
          }} />
        </div>
        
        <div className="text-[9px] text-center font-bold text-neutral-500">
          {percent.toFixed(0)}%
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans p-6 md:p-12 relative">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* AI Morning Briefing Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-indigo-100 overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
          <div className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-500" />
                  AI 모닝 브리핑
                </h2>
                <p className="text-sm text-neutral-500 mt-1">인공지능이 분석한 오늘의 글로벌 증시 요약</p>
              </div>
              <button
                onClick={handleBriefing}
                disabled={briefingState === 'loading'}
                className="px-5 py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {briefingState === 'loading' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    글로벌 뉴스 분석 중...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    오늘의 글로벌 증시 요약하기
                  </>
                )}
              </button>
            </div>

            {/* Briefing Content */}
            <AnimatePresence>
              {briefingState === 'done' && (
                <motion.div
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginTop: 24 }}
                  className="bg-neutral-50 rounded-xl p-5 border border-neutral-100 overflow-hidden"
                >
                  <div className="prose prose-sm prose-indigo max-w-none">
                    <div className="markdown-body">
                      <ReactMarkdown>{briefingResult}</ReactMarkdown>
                    </div>
                  </div>
                </motion.div>
              )}
              {briefingState === 'error' && (
                <motion.div
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginTop: 24 }}
                  className="bg-red-50 rounded-xl p-5 border border-red-100 overflow-hidden flex items-center gap-3 text-red-600"
                >
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm font-medium">{briefingError}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Header */}
        <header className="flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-neutral-900 flex items-center gap-3">
                <Activity className="w-8 h-8 text-red-600" />
                단타 수급 추적기
              </h1>
              <div className="flex items-center gap-3 mt-2">
                <p className="text-neutral-500">실시간 변동성 및 수급 주도주 분석</p>
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100 text-[11px] font-bold">
                  <span className={`w-1.5 h-1.5 rounded-full bg-emerald-500 ${isRefreshing ? 'animate-ping' : ''}`}></span>
                  다음 갱신까지: {refreshTimer}초
                </div>
              </div>
            </div>
            
            {/* Search Form */}
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  value={searchCode}
                  onChange={(e) => setSearchCode(e.target.value)}
                  placeholder="종목명 또는 코드 6자리"
                  className="pl-9 pr-4 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full md:w-64 bg-white"
                />
              </div>
              <button
                type="submit"
                disabled={isSearching || !searchCode.trim()}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : '검색'}
              </button>
            </form>
          </div>
          
          <div className="flex p-1 bg-neutral-200/60 rounded-xl w-full max-w-2xl">
            <button
              onClick={() => setMarket('volume')}
              className={`flex-1 px-4 md:px-6 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap ${
                market === 'volume' ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              거래량 급증
            </button>
            <button
              onClick={() => setMarket('search')}
              className={`flex-1 px-4 md:px-6 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap ${
                market === 'search' ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              실시간 검색 상위
            </button>
            <button
              onClick={() => setMarket('gainers')}
              className={`flex-1 px-4 md:px-6 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap ${
                market === 'gainers' ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              당일 급등주
            </button>
          </div>
        </header>

        {/* Table Container */}
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table ref={tableRef} className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-neutral-50/80 border-b border-neutral-200 text-xs uppercase tracking-wider text-neutral-500 font-semibold">
                  {[
                    { key: 'name', label: '종목명' },
                    { key: 'price', label: '현재가' },
                    { key: 'changeRate', label: '당일 등락률' },
                    { key: 'volIncr', label: '거래량 증가율' },
                    { key: 'highLow', label: '당일 고가/저가' },
                    { key: 'high52', label: '52주 최고가' },
                  ].map((col) => (
                    <th
                      key={col.key}
                      style={{ width: columnWidths[col.key], minWidth: 80 }}
                      className="relative p-4 select-none group"
                    >
                      {col.label}
                      <div
                        onMouseDown={(e) => handleMouseDown(e, col.key)}
                        className="absolute right-0 top-0 w-1.5 h-full cursor-col-resize hover:bg-indigo-300 transition-colors z-10"
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center">
                      <div className="flex flex-col items-center justify-center text-indigo-500 gap-3">
                        <Loader2 className="w-8 h-8 animate-spin" />
                        <span className="font-bold text-lg">실시간 시장 동향 파악 중...</span>
                      </div>
                    </td>
                  </tr>
                ) : globalError ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center">
                      <div className="flex flex-col items-center justify-center text-red-500 gap-3">
                        <AlertCircle className="w-8 h-8" />
                        <span className="font-bold text-lg">{globalError}</span>
                        <span className="text-sm text-neutral-500">네이버 증권 서버에서 요청을 차단했거나 일시적인 오류가 발생했습니다.</span>
                      </div>
                    </td>
                  </tr>
                ) : currentStocks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-neutral-50">
                      데이터를 불러올 수 없습니다.
                    </td>
                  </tr>
                ) : (
                  currentStocks.map((stock, index) => {
                    const overlapCount = getOverlapCount(stock.name);
                    const isThreeCrown = overlapCount >= 3;
                    const isTwoCrown = overlapCount === 2;

                    return stock.error ? (
                      <tr key={stock.id} className="bg-red-50/50">
                        <td className="p-4 font-medium text-neutral-900">{stock.id}</td>
                        <td colSpan={5} className="p-4 text-red-500 font-bold flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          {stock.error}
                        </td>
                      </tr>
                    ) : (
                      <motion.tr
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        key={stock.id}
                        onContextMenu={(e) => handleContextMenu(e, stock)}
                        onClick={() => handleRowClick(stock)}
                        className={`transition-colors group cursor-pointer ${
                          isThreeCrown 
                            ? 'bg-yellow-50 hover:bg-yellow-100 border-l-4 border-yellow-400' 
                            : isTwoCrown 
                              ? 'bg-red-50/50 hover:bg-red-50 border-l-4 border-red-300' 
                              : 'hover:bg-neutral-50/80'
                        }`}
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div className={`font-bold ${isThreeCrown ? 'text-yellow-700 text-lg' : isTwoCrown ? 'text-red-700' : 'text-neutral-900'}`}>
                              {stock.name}
                            </div>
                            {isThreeCrown && <span className="text-xl" title="3개 탭 모두 포함">👑</span>}
                            {isTwoCrown && <span className="text-lg" title="2개 탭 포함">🔥</span>}
                          </div>
                          <div className="text-[10px] text-neutral-400 font-mono">{stock.id}</div>
                        </td>
                        <td className={`p-4 font-semibold ${isThreeCrown ? 'text-yellow-800' : isTwoCrown ? 'text-red-800' : 'text-neutral-700'}`}>
                          {stock.price}
                        </td>
                        <td className="p-4">{renderChangeRate(stock.changeRate || '', stock.changeText || '')}</td>
                        <td className={`p-4 ${isThreeCrown ? 'text-yellow-700 font-medium' : isTwoCrown ? 'text-red-700 font-medium' : 'text-neutral-600'}`}>
                          {stock.volIncr}
                        </td>
                        <td className="p-4">{renderHighLowGauge(stock)}</td>
                        <td className="p-4 text-neutral-600">{stock.high52}</td>
                      </motion.tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-sm text-neutral-400 flex items-center gap-2">
          <MoreVertical className="w-4 h-4" />
          종목을 우클릭하여 AI 분석 메뉴를 확인하세요.
        </div>
      </div>

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu.visible && contextMenu.stock && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed z-50 w-48 bg-white rounded-xl shadow-xl border border-neutral-200 py-1 overflow-hidden"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <div className="px-3 py-2 text-xs font-semibold text-neutral-500 border-b border-neutral-100 bg-neutral-50">
              {contextMenu.stock.name}
            </div>
            <button
              className="w-full text-left px-4 py-2.5 text-sm text-neutral-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center gap-2"
              onClick={() => handleAIAction('analysis')}
            >
              <Activity className="w-4 h-4" />
              AI 종목 분석
            </button>
            <button
              className="w-full text-left px-4 py-2.5 text-sm text-neutral-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center gap-2"
              onClick={() => handleAIAction('strategy')}
            >
              <TrendingUp className="w-4 h-4" />
              AI 투자 전략
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mini Chart Modal */}
      <AnimatePresence>
        {chartModal.visible && chartModal.stock && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
                <div>
                  <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
                    {chartModal.stock.name}
                    <span className="text-xs font-mono text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded">
                      {chartModal.stock.id}
                    </span>
                  </h2>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-lg font-bold text-neutral-700">{chartModal.stock.price}</span>
                    {renderChangeRate(chartModal.stock.changeRate || '', chartModal.stock.changeText || '')}
                  </div>
                </div>
                <button
                  onClick={() => setChartModal({ visible: false, stock: null })}
                  className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 bg-white flex flex-col items-center">
                <div className="w-full aspect-[4/3] relative bg-neutral-100 rounded-lg overflow-hidden border border-neutral-200">
                  <img
                    src={`https://ssl.pstatic.net/imgfinance/chart/item/area/day/${chartModal.stock.id}.png?sid=${Date.now()}`}
                    alt={`${chartModal.stock.name} 일봉 차트`}
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <p className="text-[10px] text-neutral-400 mt-2 self-start">
                  * 네이버 증권에서 제공하는 실시간 일봉 차트입니다.
                </p>
              </div>

              <div className="p-4 bg-neutral-50 border-t border-neutral-100 flex gap-3">
                <button
                  onClick={() => setChartModal({ visible: false, stock: null })}
                  className="flex-1 py-2.5 bg-white border border-neutral-200 text-neutral-700 font-medium rounded-xl hover:bg-neutral-100 transition-colors"
                >
                  닫기
                </button>
                <a
                  href={`https://finance.naver.com/item/main.naver?code=${chartModal.stock.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2.5 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                >
                  상세 보기
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AI Analysis Modal */}
      <AnimatePresence>
        {aiModal.visible && aiModal.stock && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="flex items-center justify-between p-6 border-b border-neutral-100 bg-neutral-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                    {aiModal.type === 'analysis' ? <Activity className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-neutral-900">
                      {aiModal.stock.name} {aiModal.type === 'analysis' ? 'AI 종목 분석' : 'AI 투자 전략'}
                    </h2>
                    <p className="text-sm text-neutral-500 font-mono">
                      현재가: {aiModal.stock.price} ({aiModal.stock.changeRate})
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setAiModal({ ...aiModal, visible: false })}
                  className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1">
                {aiModal.loading && !aiModal.result ? (
                  <div className="flex flex-col items-center justify-center py-12 text-neutral-500 space-y-4">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                    <p className="text-sm font-medium animate-pulse">AI가 데이터를 분석 중입니다...</p>
                  </div>
                ) : (
                  <div className="prose prose-sm md:prose-base prose-indigo max-w-none">
                    <div className="markdown-body">
                      <ReactMarkdown>{aiModal.result}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="p-4 border-t border-neutral-100 bg-neutral-50 flex justify-end">
                <button
                  onClick={() => setAiModal({ ...aiModal, visible: false })}
                  className="px-6 py-2 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors"
                >
                  닫기
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
