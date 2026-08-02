/* ============================================================
   Asiri Obsidian Command - JavaScript
   التفاعلية والحركة والبيانات الحية
   ============================================================ */

// ── Decision States ──
const DECISION_STATES = {
  WAIT: {
    class: 'wait',
    text: 'WAIT',
    color: '#FFBF47',
    confidence: 52,
    description: 'انتظار إشارات أقوى'
  },
  BUY: {
    class: 'buy',
    text: 'BUY',
    color: '#26E6A1',
    confidence: 78,
    description: 'فرصة شراء قوية'
  },
  PROTECT: {
    class: 'protect',
    text: 'PROTECT',
    color: '#FF5E73',
    confidence: 45,
    description: 'حماية رأس المال'
  },
  ANALYZING: {
    class: 'analyzing',
    text: 'ANALYZING',
    color: '#4BB8FF',
    confidence: 0,
    description: 'جاري التحليل'
  }
};

// ── Current State ──
let currentDecision = DECISION_STATES.WAIT;
let isAnimating = false;

// ── DOM Elements ──
const decisionOrb = document.getElementById('decisionOrb');
const orbDecision = document.querySelector('.orb-decision');
const orbConfidence = document.querySelector('.orb-confidence');
const navItems = document.querySelectorAll('.nav-item');

// ── Initialize ──
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
  setupEventListeners();
  startLiveUpdates();
});

// ── Initialize App ──
function initializeApp() {
  console.log('🚀 Asiri Obsidian Command initialized');
  updateDecisionOrb(DECISION_STATES.WAIT);
}

// ── Setup Event Listeners ──
function setupEventListeners() {
  // Navigation
  navItems.forEach((item, index) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      handleNavigation(index);
    });
  });

  // Decision Orb Click
  decisionOrb.addEventListener('click', () => {
    cycleDecision();
  });

  // Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ') {
      e.preventDefault();
      cycleDecision();
    }
  });
}

// ── Update Decision Orb ──
function updateDecisionOrb(decision) {
  if (isAnimating) return;
  
  isAnimating = true;
  
  // Remove old class
  Object.values(DECISION_STATES).forEach(state => {
    decisionOrb.classList.remove(state.class);
  });
  
  // Add new class
  decisionOrb.classList.add(decision.class);
  
  // Update content with animation
  orbDecision.style.opacity = '0';
  orbConfidence.style.opacity = '0';
  
  setTimeout(() => {
    orbDecision.textContent = decision.text;
    orbConfidence.textContent = `${decision.confidence}%`;
    orbDecision.style.opacity = '1';
    orbConfidence.style.opacity = '1';
  }, 150);
  
  currentDecision = decision;
  
  setTimeout(() => {
    isAnimating = false;
  }, 300);
}

// ── Cycle Decision ──
function cycleDecision() {
  const decisions = Object.values(DECISION_STATES);
  const currentIndex = decisions.indexOf(currentDecision);
  const nextIndex = (currentIndex + 1) % decisions.length;
  updateDecisionOrb(decisions[nextIndex]);
}

// ── Handle Navigation ──
function handleNavigation(index) {
  navItems.forEach((item, i) => {
    item.classList.toggle('active', i === index);
  });
  
  const pages = ['home', 'portfolio', 'intelligence', 'markets', 'alerts', 'settings'];
  console.log(`📍 Navigating to: ${pages[index]}`);
}

// ── Start Live Updates ──
function startLiveUpdates() {
  // Update market prices every 2 seconds
  setInterval(updateMarketPrices, 2000);
  
  // Update time every second
  setInterval(updateTime, 1000);
  
  // Simulate decision changes every 30 seconds
  setInterval(simulateDecisionChange, 30000);
}

// ── Update Market Prices ──
function updateMarketPrices() {
  const pulseItems = document.querySelectorAll('.pulse-item');
  
  pulseItems.forEach(item => {
    const value = item.querySelector('.pulse-value');
    const change = item.querySelector('.pulse-change');
    
    // Simulate price change
    const currentPrice = parseFloat(value.textContent);
    const changePercent = (Math.random() - 0.5) * 0.1;
    const newPrice = (currentPrice * (1 + changePercent / 100)).toFixed(2);
    
    // Animate price change
    value.style.opacity = '0.5';
    setTimeout(() => {
      value.textContent = newPrice;
      value.style.opacity = '1';
    }, 100);
    
    // Update change indicator
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

// ── Update Time ──
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

// ── Simulate Decision Change ──
function simulateDecisionChange() {
  // Randomly change decision for demo
  const decisions = Object.values(DECISION_STATES);
  const randomDecision = decisions[Math.floor(Math.random() * decisions.length)];
  
  // Only update if different from current
  if (randomDecision !== currentDecision) {
    updateDecisionOrb(randomDecision);
  }
}

// ── Utility Functions ──

// Smooth scroll to section
function scrollToSection(selector) {
  const element = document.querySelector(selector);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth' });
  }
}

// Format number with commas
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Get status color
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
    DECISION_STATES,
    updateDecisionOrb,
    cycleDecision,
    updateMarketPrices,
    updateTime
  };
}

// ── Console Messages ──
console.log('%c🎯 Asiri Obsidian Command v26', 'color: #4BB8FF; font-size: 16px; font-weight: bold;');
console.log('%cClick the Decision Orb to cycle through decisions', 'color: #26E6A1; font-size: 12px;');
console.log('%cPress SPACE to change decision', 'color: #FFBF47; font-size: 12px;');
