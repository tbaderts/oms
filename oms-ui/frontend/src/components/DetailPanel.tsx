// DetailPanel.tsx - Expandable row detail for viewing complex nested objects
import React from 'react';
import './DetailPanel.scss';

interface DetailPanelProps {
  data: any;
  columns?: string[];
}

const DetailPanel: React.FC<DetailPanelProps> = ({ data, columns }) => {
  // Function to format JSON with syntax highlighting
  const formatJSON = (obj: any): JSX.Element => {
    const jsonString = JSON.stringify(obj, null, 2);
    
    // Split into lines and apply syntax highlighting
    const lines = jsonString.split('\n');
    
    return (
      <pre className="json-display">
        <code>
          {lines.map((line, index) => (
            <div key={index} className="json-line">
              {highlightLine(line)}
            </div>
          ))}
        </code>
      </pre>
    );
  };

  // Apply syntax highlighting to a single line
  const highlightLine = (line: string): JSX.Element[] => {
    const parts: JSX.Element[] = [];
    
    // Regular expressions for different JSON elements
    const keyRegex = /"([^"]+)":/g;
    const stringRegex = /:"([^"]*)"/g;
    const numberRegex = /:\s*(-?\d+\.?\d*)/g;
    const booleanRegex = /:\s*(true|false)/g;
    const nullRegex = /:\s*(null)/g;
    
    // Process the line character by character with pattern matching
    let match;
    const processed: Array<{ start: number; end: number; type: string; text: string }> = [];
    
    // Find keys
    const tempLine = line;
    keyRegex.lastIndex = 0;
    while ((match = keyRegex.exec(tempLine)) !== null) {
      processed.push({
        start: match.index,
        end: match.index + match[0].length - 1,
        type: 'key',
        text: match[1]
      });
    }
    
    // Find string values
    stringRegex.lastIndex = 0;
    while ((match = stringRegex.exec(tempLine)) !== null) {
      processed.push({
        start: match.index + 1,
        end: match.index + match[0].length,
        type: 'string',
        text: match[1]
      });
    }
    
    // Find numbers
    numberRegex.lastIndex = 0;
    while ((match = numberRegex.exec(tempLine)) !== null) {
      processed.push({
        start: match.index + match[0].indexOf(match[1]),
        end: match.index + match[0].indexOf(match[1]) + match[1].length,
        type: 'number',
        text: match[1]
      });
    }
    
    // Find booleans
    booleanRegex.lastIndex = 0;
    while ((match = booleanRegex.exec(tempLine)) !== null) {
      processed.push({
        start: match.index + match[0].indexOf(match[1]),
        end: match.index + match[0].indexOf(match[1]) + match[1].length,
        type: 'boolean',
        text: match[1]
      });
    }
    
    // Find null
    nullRegex.lastIndex = 0;
    while ((match = nullRegex.exec(tempLine)) !== null) {
      processed.push({
        start: match.index + match[0].indexOf(match[1]),
        end: match.index + match[0].indexOf(match[1]) + match[1].length,
        type: 'null',
        text: match[1]
      });
    }
    
    // Sort by start position
    processed.sort((a, b) => a.start - b.start);
    
    // Build the highlighted line
    let currentPos = 0;
    processed.forEach(item => {
      // Add text before this item
      if (currentPos < item.start) {
        parts.push(
          <span key={`text-${currentPos}`}>
            {line.substring(currentPos, item.start)}
          </span>
        );
      }
      
      // Add the highlighted item
      parts.push(
        <span key={`${item.type}-${item.start}`} className={`json-${item.type}`}>
          {line.substring(item.start, item.end)}
        </span>
      );
      
      currentPos = item.end;
    });
    
    // Add remaining text
    if (currentPos < line.length) {
      parts.push(
        <span key={`text-${currentPos}`}>
          {line.substring(currentPos)}
        </span>
      );
    }
    
    return parts.length > 0 ? parts : [<span key="line">{line}</span>];
  };

  // Filter data to show only complex fields or all fields
  const getDisplayData = (): any => {
    if (!data) return {};
    
    // If columns are specified, filter the data
    if (columns && columns.length > 0) {
      const filtered: any = {};
      columns.forEach(col => {
        if (data.hasOwnProperty(col)) {
          filtered[col] = data[col];
        }
      });
      return filtered;
    }
    
    // Otherwise show all fields, prioritizing complex objects
    const complexFields: any = {};
    const simpleFields: any = {};
    
    Object.keys(data).forEach(key => {
      const value = data[key];
      if (value !== null && typeof value === 'object') {
        complexFields[key] = value;
      } else {
        simpleFields[key] = value;
      }
    });
    
    // Show complex fields first, then simple fields
    return { ...complexFields, ...simpleFields };
  };

  const displayData = getDisplayData();

  return (
    <div className="detail-panel">
      <div className="detail-panel-header">
        <h3>Order Details</h3>
      </div>
      <div className="detail-panel-content">
        {Object.keys(displayData).length > 0 ? (
          formatJSON(displayData)
        ) : (
          <p className="no-data">No additional details available</p>
        )}
      </div>
    </div>
  );
};

export default DetailPanel;
