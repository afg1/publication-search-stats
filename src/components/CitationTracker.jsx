import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Button } from './ui/button';
import { Download, Search } from "lucide-react";

const CitationTracker = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [debugInfo, setDebugInfo] = useState(null);

  const fetchCitationsPage = async (query, pageSize, cursorMark) => {
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&format=json&resultType=lite&pageSize=${pageSize}&cursorMark=${encodeURIComponent(cursorMark)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch data');
    return await response.json();
  };

  const fetchCitations = async () => {
    if (!searchTerm) return;
    
    setLoading(true);
    setError('');
    setProgress('Starting search...');
    setDebugInfo(null);
    
    try {
      const citationsByYear = {};
      let cursorMark = '*';
      let nextCursorMark = '';
      let totalResults = 0;
      let processedResults = 0;
      let samplePaper = null;
      const pageSize = 1000;

      // First request to get total count
      const firstPage = await fetchCitationsPage(searchTerm, pageSize, cursorMark);
      totalResults = firstPage.hitCount;
      
      // Save first result for debugging
      if (firstPage.resultList.result.length > 0) {
        samplePaper = firstPage.resultList.result[0];
      }
      
      setProgress(`Found ${totalResults} results. Processing...`);

      do {
        const result = await fetchCitationsPage(searchTerm, pageSize, cursorMark);
        nextCursorMark = result.nextCursorMark;
        
        result.resultList.result.forEach(paper => {
          // Try different possible year fields
          const year = paper.pubYear || 
                      (paper.firstPublicationDate && paper.firstPublicationDate.substring(0,4)) ||
                      (paper.electronicPublicationDate && paper.electronicPublicationDate.substring(0,4));
                      
          if (year && !isNaN(parseInt(year))) {
            const yearNum = parseInt(year);
            // Only count years that make sense (e.g., between 1700 and current year + 1)
            if (yearNum >= 1700 && yearNum <= new Date().getFullYear() + 1) {
              citationsByYear[year] = (citationsByYear[year] || 0) + 1;
            }
          }
        });

        processedResults += result.resultList.result.length;
        setProgress(`Processed ${processedResults} of ${totalResults} results...`);
        
        cursorMark = nextCursorMark;
      } while (processedResults < totalResults);

      const chartData = Object.entries(citationsByYear)
        .map(([year, count]) => ({
          year: parseInt(year),
          citations: count
        }))
        .sort((a, b) => a.year - b.year);
      
      setData(chartData);
      setProgress('');
      
      // Set debug info
      setDebugInfo({
        totalResults,
        processedResults,
        yearsFound: Object.keys(citationsByYear).length,
        samplePaper
      });

    } catch (err) {
      console.error('Error:', err);
      setError('Failed to fetch citation data. Please try again.');
      setProgress('');
    } finally {
      setLoading(false);
    }
  };

  const downloadChart = () => {
    const svg = document.querySelector('.citation-chart svg');
    if (!svg) {
      console.log('SVG not found!');
      return;
    }

    const canvas = document.createElement('canvas');
    const scale = 300 / 96;
    canvas.width = svg.width.baseVal.value * scale;
    canvas.height = svg.height.baseVal.value * scale;
    
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const URL = window.URL || window.webkitURL || window;
    const svgUrl = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      
      const link = document.createElement('a');
      link.download = 'citations.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      
      URL.revokeObjectURL(svgUrl);
    };
    img.src = svgUrl;
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6">Citation Count Tracker</h2>
      
      <div className="flex gap-4 mb-6">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Enter search term..."
          className="flex-1 px-4 py-2 border rounded-md"
        />
        <Button 
          onClick={fetchCitations}
          disabled={loading}
          className="flex items-center gap-2"
        >
          <Search className="w-4 h-4" />
          {loading ? 'Loading...' : 'Search'}
        </Button>
        <Button
          variant="outline"
          onClick={downloadChart}
          className="flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Download PNG
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            // Create CSV content
            const csvContent = ['Year,Publications\n'];
            data.forEach(({ year, citations }) => {
              csvContent.push(`${year},${citations}\n`);
            });
            
            // Create and trigger download
            const blob = new Blob(csvContent, { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'publication_counts.csv';
            link.click();
            URL.revokeObjectURL(link.href);
          }}
          className="flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Download CSV
        </Button>
      </div>

      {error && <p className="text-red-500 mb-4">{error}</p>}
      {progress && <p className="text-blue-500 mb-4">{progress}</p>}
      
      <div style={{ width: '100%', height: '400px', border: '1px solid #eee' }}>
        {data.length > 0 && (
          <ResponsiveContainer>
            <LineChart 
              data={data} 
              margin={{ top: 20, right: 30, left: 50, bottom: 20 }}
              className="citation-chart"
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="year"
                label={{ value: 'Year', position: 'bottom', offset: -5 }}
              />
              <YAxis 
                label={{ value: 'Number of Publications', angle: -90, position: 'insideLeft', offset: 10 }}
              />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="citations"
                name="Publications"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {debugInfo && (
        <div className="mt-4 p-4 bg-gray-100 rounded text-sm">
          <h3 className="font-bold mb-2">Debug Information:</h3>
          <p>Total results: {debugInfo.totalResults}</p>
          <p>Processed results: {debugInfo.processedResults}</p>
          <p>Years found: {debugInfo.yearsFound}</p>
          <p>Sample paper:</p>
          <pre className="mt-2 overflow-auto">
            {JSON.stringify(debugInfo.samplePaper, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default CitationTracker;