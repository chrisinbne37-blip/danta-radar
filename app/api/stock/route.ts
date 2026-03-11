import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'volume'; // volume, search, gainers
  
  try {
    let targetUrl = '';
    switch (type) {
      case 'volume':
        targetUrl = 'https://finance.naver.com/sise/sise_quant.naver';
        break;
      case 'search':
        targetUrl = 'https://finance.naver.com/sise/lastsearch2.naver';
        break;
      case 'gainers':
        targetUrl = 'https://finance.naver.com/sise/sise_rise.naver';
        break;
      default:
        targetUrl = 'https://finance.naver.com/sise/sise_quant.naver';
    }

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const html = iconv.decode(Buffer.from(buffer), 'euc-kr');
    const $ = cheerio.load(html);

    const stocks: any[] = [];
    
    // 네이버 증권 리스트 테이블 파싱
    // 대부분 type_2를 사용하지만 인기검색은 type_5를 사용함
    const tableSelector = type === 'search' ? 'table.type_5 tr' : 'table.type_2 tr';
    
    $(tableSelector).each((i, el) => {
      if (stocks.length >= 12) return false;

      try {
        const $tds = $(el).find('td');
        if ($tds.length < 5) return; // 유효한 데이터 행이 아님

        // 1. 함정(빈 줄) 회피: 종목명 링크(<a>)가 있는지 확인
        // 네이버 증권은 보통 a.tltle 또는 td.name a 등을 사용함
        let $targetLink = $(el).find('a.tltle');
        if ($targetLink.length === 0) {
          $targetLink = $(el).find('td.name a');
        }
        if ($targetLink.length === 0) {
          $targetLink = $(el).find('a').filter((_, a) => !!$(a).attr('href')?.includes('code='));
        }

        if ($targetLink.length === 0 || $targetLink.text().trim() === '') return;

        const name = $targetLink.text().trim();
        const href = $targetLink.attr('href') || '';
        const id = href.split('code=')[1]?.split('&')[0] || ''; // 파라미터가 더 있을 수 있으므로 분리
        
        if (!id) return;

        // 컬럼 인덱스 설정 (페이지 타입에 따라 다름)
        let price = '';
        let changeText = '';
        let changeRate = '';
        let volume = '';

        if (type === 'volume' || type === 'gainers') {
          // sise_quant, sise_rise 구조: No(0), 종목명(1), 현재가(2), 전일대비(3), 등락률(4), 거래량(5)
          price = $tds.eq(2).text().trim();
          changeText = $tds.eq(3).find('span').text().trim();
          changeRate = $tds.eq(4).text().trim();
          volume = $tds.eq(5).text().trim();
        } else if (type === 'search') {
          // lastsearch2 구조: 순위(0), 종목명(1), 검색비율(2), 현재가(3), 전일대비(4), 등락률(5), 거래량(6)
          price = $tds.eq(3).text().trim();
          changeText = $tds.eq(4).find('span').text().trim();
          changeRate = $tds.eq(5).text().trim();
          volume = $tds.eq(6).text().trim();
        }

        if (!name) return;

        stocks.push({
          id,
          name,
          price: price || 'N/A',
          changeRate: changeRate || '0%',
          changeText: changeText || '',
          volIncr: volume || '0',
          highLow: 'N/A',
          high52: 'N/A'
        });
      } catch (rowError) {
        console.error(`[Row Error] Type: ${type}, Index: ${i}`, rowError);
      }
    });

    if (stocks.length === 0) {
      console.warn(`[Scraping Warning] No stocks found for type: ${type}. HTML structure might have changed.`);
      // 에러를 던지지 않고 빈 배열 반환하여 UI 크래시 방지
      return NextResponse.json([]);
    }

    // Collect all IDs for real-time data enrichment
    const ids = stocks.map(s => s.id).filter(id => !!id);
    
    if (ids.length > 0) {
      try {
        // Use Promise.all to fetch detailed data for each stock from the mobile API
        // We use the 'integration' endpoint as it's proven to be reliable for 52-week high
        await Promise.all(stocks.map(async (stock) => {
          try {
            const intRes = await fetch(`https://m.stock.naver.com/api/stock/${stock.id}/integration`, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://m.stock.naver.com/'
              },
              cache: 'no-store'
            });

            if (intRes.ok) {
              const intData = await intRes.json();
              
              // Extract data from totalInfos array which contains key-value pairs
              const infos = intData.totalInfos || [];
              
              const findInfo = (code: string) => infos.find((info: any) => info.code === code)?.value;
              
              const currentPrice = findInfo('closePrice');
              const highPrice = findInfo('highPrice');
              const lowPrice = findInfo('lowPrice');
              const high52 = findInfo('highPriceOf52Weeks');
              const volume = findInfo('accumulatedTradingVolume');
              const ratio = findInfo('fluctuationsRatio');
              
              if (currentPrice) stock.price = currentPrice;
              if (volume) stock.volIncr = volume;
              if (high52) stock.high52 = high52;
              if (ratio) {
                const numRatio = parseFloat(ratio.replace(/,/g, ''));
                stock.changeRate = (numRatio > 0 ? '+' : '') + ratio + '%';
              }
              
              // CRITICAL: Set high/low for the gauge bar
              if (highPrice && lowPrice) {
                stock.highLow = `${highPrice} / ${lowPrice}`;
              } else {
                // Fallback to stockItem if totalInfos doesn't have it
                const si = intData.stockItem;
                if (si && si.highPrice && si.lowPrice) {
                  stock.highLow = `${si.highPrice} / ${si.lowPrice}`;
                }
              }

              // Update change text if available
              const compareInfo = infos.find((info: any) => info.code === 'compareToPreviousClosePrice');
              if (compareInfo && compareInfo.desc) {
                stock.changeText = compareInfo.desc;
              }
            }
          } catch (err) {
            console.error(`Enrichment error for ${stock.id}:`, err);
          }
        }));
      } catch (enrichError) {
        console.error('Global Enrichment Error:', enrichError);
      }
    }

    return NextResponse.json(stocks);
  } catch (error) {
    console.error(`[Global Scraping Error] Type: ${type}`, error);
    // 에러 발생 시 빈 배열 반환하여 404/500 UI 방지
    return NextResponse.json([]);
  }
}
