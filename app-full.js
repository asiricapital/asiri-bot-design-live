/* ============================================================
   Asiri Obsidian Command v26 - Full Application JavaScript
   ============================================================ */

// ── Configuration ──
const CONFIG = {
  CHART_COLORS: {
    up: 'rgba(38, 230, 161, 0.8)',
    down: 'rgba(255, 94, 115, 0.8)',
    neutral: 'rgba(75, 184, 255, 0.8)',
    background: 'rgba(75, 184, 255, 0.1)'
  },
  ANIMATION_DURATION: 300
};

// ── State Management ──
let appState = {
  currentPage: 'home-page',
  charts: {},
  data: {
    portfolio: {
      total: 125842.69,
      dayChange: 2958.21,
      totalGain: 18342.11
    }
  }
};

// ── DOM Elements ──
const pages = document.querySelectorAll('.page');
const navItems = document.querySelectorAll('.nav-item');
const decisionOrb = document.getElementById('decisionOrb');
const orbDecision = document.querySelector('.orb-decision');
const orbConfidence = document.querySelector('.orb-confidence');

// ── Initialize ──
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
  setupEventListeners();
  initializeCharts();
  startLiveUpdates();
});

// ── Initialize App ──
function initializeApp() {
  console.log('🚀 Asiri Obsidian Command v26 - Full Application');
  navigateToPage('home-page');
}

// ── Setup Event Listeners ──
function setupEventListeners() {
  // Navigation
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const pageName = item.getAttribute('data-page');
      navigateToPage(pageName);
      updateActiveNav(item);
    });
  });

  // Decision Orb
  if (decisionOrb) {
    decisionOrb.addEventListener('click', cycleDecision);
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ') {
      e.preventDefault();
      cycleDecision();
    }
    // Number keys for quick navigation
    const pageMap = {
      '1': 'home-page',
      '2': 'portfolio-page',
      '3': 'intelligence-page',
      '4': 'markets-page',
      '5': 'alerts-page',
      '6': 'settings-page'
    };
    if (pageMap[e.key]) {
      navigateToPage(pageMap[e.key]);
    }
  });
}

// ── Navigate to Page ──
function navigateToPage(pageName) {
  // Hide all pages
  pages.forEach(page => {
    page.classList.remove('active');
  });

  // Show selected page
  const selectedPage = document.querySelector(`.${pageName}`);
  if (selectedPage) {
    selectedPage.classList.add('active');
    appState.currentPage = pageName;
    
    // Initialize page-specific content
    if (pageName === 'portfolio-page') {
      initializePortfolioChart();
    } else if (pageName === 'markets-page') {
      initializeMarketCharts();
    }
  }
}

// ── Update Active Navigation ──
function updateActiveNav(activeItem) {
  navItems.forEach(item => {
    item.classList.remove('active');
  });
  activeItem.classList.add('active');
}

// ── Decision Orb Logic ──
const DECISION_STATES = {
  WAIT: {
    class: 'wait',
    text: 'WAIT',
    confidence: 52,
    description: 'انتظار إشارات أقوى'
  },
  BUY: {
    class: 'buy',
    text: 'BUY',
    confidence: 78,
    description: 'فرصة شراء قوية'
  },
  PROTECT: {
    class: 'protect',
    text: 'PROTECT',
    confidence: 45,
    description: 'حماية رأس المال'
  },
  ANALYZING: {
    class: 'analyzing',
    text: 'ANALYZING',
    confidence: 0,
    description: 'جاري التحليل'
  }
};

let currentDecision = DECISION_STATES.WAIT;

function updateDecisionOrb(decision) {
  if (!decisionOrb) return;

  // Remove old classes
  Object.values(DECISION_STATES).forEach(state => {
    decisionOrb.classList.remove(state.class);
  });

  // Add new class
  decisionOrb.classList.add(decision.class);

  // Update content
  orbDecision.textContent = decision.text;
  orbConfidence.textContent = `${decision.confidence}%`;

  currentDecision = decision;
}

function cycleDecision() {
  const decisions = Object.values(DECISION_STATES);
  const currentIndex = decisions.indexOf(currentDecision);
  const nextIndex = (currentIndex + 1) % decisions.length;
  updateDecisionOrb(decisions[nextIndex]);
}

// ── Charts Initialization ──
function initializeCharts() {
  console.log('📊 Initializing charts...');
}

function initializePortfolioChart() {
  const canvas = document.getElementById('portfolioChart');
  if (!canvas || appState.charts.portfolio) return;

  const ctx = canvas.getContext('2d');
  
  // Sample data - replace with real data
  const data = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    datasets: [{
      label: 'Portfolio Value',
      data: [110000, 115000, 112000, 120000, 125000, 125842.69],
      borderColor: 'rgba(38, 230, 161, 0.8)',
      backgroundColor: 'rgba(38, 230, 161, 0.1)',
      borderWidth: 2,
      fill: true,
      tension: 0.4,
      pointRadius: 4,
      pointBackgroundColor: 'rgba(38, 230, 161, 1)',
      pointBorderColor: '#05080D',
      pointBorderWidth: 2
    }];
  };

  appState.charts.portfolio = new Chart(ctx, {
    type: 'line',
    data: data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          grid: {
            color: 'rgba(75, 184, 255, 0.1)',
            drawBorder: false
          },
          ticks: {
            color: 'rgba(160, 176, 192, 0.8)',
            font: {
              size: 11
            }
          }
        },
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: 'rgba(160, 176, 192, 0.8)',
            font: {
              size: 11
            }
          }
        }
      }
    }
  });
}

function initializeMarketCharts() {
  const markets = [
    { id: 'chart-sp500', label: 'S&P 500', data: [640, 641, 642, 641.5, 642.81] },
    { id: 'chart-nasdaq', label: 'NASDAQ', data: [550, 551, 552, 553, 553.22] },
    { id: 'chart-vix', label: 'VIX', data: [18, 17.5, 17.2, 17.1, 17.10] },
    { id: 'chart-gold', label: 'GOLD', data: [2450, 2445, 2440, 2438, 2437.90] },
    { id: 'chart-oil', label: 'OIL', data: [80, 81, 81.5, 82, 82.45] },
    { id: 'chart-dxy', label: 'DXY', data: [103, 103.5, 104, 104.1, 104.21] }
  ];

  markets.forEach(market => {
    const canvas = document.getElementById(market.id);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const isUp = market.data[market.data.length - 1] > market.data[0];

    new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['', '', '', '', ''],
        datasets: [{
          data: market.data,
          borderColor: isUp ? CONFIG.CHART_COLORS.up : CONFIG.CHART_COLORS.down,
          backgroundColor: isUp ? 'rgba(38, 230, 161, 0.1)' : 'rgba(255, 94, 115, 0.1)',
          borderWidth: 1.5,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            display: false,
            beginAtZero: false
          },
          x: {
            display: false
          }
        }
      }
    });
  });
}

// ── Live Updates ──
function startLiveUpdates() {
  // Update time every second
  setInterval(updateTime, 1000);

  // Update market prices every 2 seconds
  setInterval(updateMarketPrices, 2000);

  // Simulate decision changes every 30 seconds
  setInterval(simulateDecisionChange, 30000);
}

function updateTime() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('ar-SA', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const barTime = document.querySelector('.bar-time');
  if (barTime) {
    barTime.textContent = `${timeStr} GMT+3`;
  }
}

function updateMarketPrices() {
  const pulseItems = document.querySelectorAll('.pulse-item');

  pulseItems.forEach(item => {
    const value = item.querySelector('.pulse-value');
    const change = item.querySelector('.pulse-change');

    if (!value || !change) return;

    const currentPrice = parseFloat(value.textContent);
    const changePercent = (Math.random() - 0.5) * 0.1;
    const newPrice = (currentPrice * (1 + changePercent / 100)).toFixed(2);

    // Animate
    value.style.opacity = '0.5';
    setTimeout(() => {
      value.textContent = newPrice;
      value.style.opacity = '1';
    }, 100);

    // Update change
    if (changePercent > 0) {
      change.classList.remove('down');
      change.classList.add('up');
      change.textContent = `▲ ${Math.abs(changePercent).toFixed(2)}%`;
    } else {
      change.classList.remove('up');
      change.classList.add('down');
      change.textContent = `▼ ${Math.abs(changePercent).toFixed(2)}%`;
    }
  });
}

function simulateDecisionChange() {
  // Randomly change decision for demo
  const decisions = Object.values(DECISION_STATES);
  const randomDecision = decisions[Math.floor(Math.random() * decisions.length)];

  if (randomDecision !== currentDecision) {
    updateDecisionOrb(randomDecision);
  }
}

// ── Utility Functions ──
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function getStatusColor(status) {
  const colors = {
    'live': '#26E6A1',
    'delayed': '#FFBF47',
    'stale': '#FF5E73',
    'incomplete': '#6B7A8F'
  };
  return colors[status] || '#A0B0C0';
}

// ── Export for testing ──
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    navigateToPage,
    updateDecisionOrb,
    cycleDecision,
    DECISION_STATES
  };
}

// ── Console Messages ──
console.log('%c🎯 Asiri Obsidian Command v26', 'color: #4BB8FF; font-size: 16px; font-weight: bold;');
console.log('%cClick the Decision Orb to cycle through decisions', 'color: #26E6A1; font-size: 12px;');
console.log('%cPress SPACE to change decision', 'color: #FFBF47; font-size: 12px;');
console.log('%cPress 1-6 for quick navigation', 'color: #A78BFA; font-size: 12px;');
