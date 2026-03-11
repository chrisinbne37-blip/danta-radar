import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  
  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'https://m.stock.naver.com/'
  };

  try {
    // Fetch basic info for real-time price
    const basicRes = await fetch(`https://m.stock.naver.com/api/stock/${code}/basic`, {
      headers,
      cache: 'no-store'
    });
    
    if (!basicRes.ok) {
      return NextResponse.json({ error: `API 호출 에러 (${basicRes.status})` }, { status: basicRes.status });
    }
    
    const basicData = await basicRes.json();
    
    // Fetch integration info for volume, 52-week high, target price
    const intRes = await fetch(`https://m.stock.naver.com/api/stock/${code}/integration`, {
      headers,
      cache: 'no-store'
    });
    
    if (!intRes.ok) {
      return NextResponse.json({ error: `API 호출 에러 (${intRes.status})` }, { status: intRes.status });
    }
    
    const intData = await intRes.json();
    const stockItem = basicData;
    
    const currentPrice = stockItem.closePrice || 'N/A';
    const changeRate = stockItem.fluctuationsRatio ? 
      (parseFloat(stockItem.fluctuationsRatio) > 0 ? '+' : '') + stockItem.fluctuationsRatio + '%' : 'N/A';
    const changeText = stockItem.compareToPreviousPrice?.name || stockItem.compareToPreviousPrice?.text || '';
    
    // Volume increase rate
    const volIncrInfo = intData.totalInfos?.find((info: any) => info.code === 'accumulatedTradingVolumeRate');
    const volIncr = volIncrInfo ? volIncrInfo.value + '%' : 'N/A';
    
    // High/Low
    const highPrice = intData.stockItem?.highPrice || 'N/A';
    const lowPrice = intData.stockItem?.lowPrice || 'N/A';
    const highLow = `${highPrice} / ${lowPrice}`;
    
    const high52Info = intData.totalInfos?.find((info: any) => info.code === 'highPriceOf52Weeks');
    const high52 = high52Info ? high52Info.value : 'N/A';

    return NextResponse.json({
      id: code,
      name: stockItem.stockName,
      price: currentPrice,
      changeRate: changeRate,
      changeText: changeText,
      volIncr: volIncr,
      highLow: highLow,
      high52: high52
    });
  } catch (error) {
    console.error('API Error:', error);
    // Fallback to mock data for search if real API fails
    return NextResponse.json({
      id: code,
      name: '검색 종목',
      price: '75,000',
      changeRate: '+2.5%',
      changeText: '상승',
      volIncr: '120%',
      highLow: '76,000 / 74,000',
      high52: '82,000'
    });
  }
}
