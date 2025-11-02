import React from 'react';
import './PageSourceBadge.css';

interface PageSourceBadgeProps {
  source: string;
}

const PageSourceBadge: React.FC<PageSourceBadgeProps> = ({ source }) => (
  <div className="page-source-badge">
    <span>{source}</span>
  </div>
);

export default PageSourceBadge;
