import React, { useState, useEffect, useCallback } from 'react';
import { 
  Wallet, Bot, ArrowUpRight, ArrowDownRight, Clock, CheckCircle, 
  XCircle, AlertCircle, Shield, Activity, DollarSign, Users,
  ChevronRight, Settings, Search, Bell, Plus, Filter, RefreshCw,
  Zap, TrendingUp, Eye, EyeOff, Copy, Loader2, WifiOff, Database, Rss
} from 'lucide-react';
import KalshiTradingDashboard from './components/AgentWalletDashboard';
import AgentWalletGovernanceDashboard from './components/AgentWalletGovernanceDashboard';
import LiveFeedDashboard from './components/LiveFeedDashboard';

// ============================================
// CONFIGURATION
// ============================================
const API_BASE_URL = 'https://agentwallet-api-164814074525.us-central1.run.app';
const DEMO_MODE_DEFAULT = false;

// ============================================
// API SERVICE
// ============================================
const api = {
  async request(endpoint, options = {}) {
    const apiKey = localStorage.getItem('agentwallet_api_key') || 'demo-owner-key';
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...options.headers,
      },
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
    }
    
    return response.json();
  },
  
  // Health check
  health: () => api.request('/health'),
  
  // Agents
  getAgents: () => api.request('/api/agents'),
  createAgent: (data) => api.request('/api/agents', { method: 'POST', body: JSON.stringify(data) }),
  pauseAgent: (id) => api.request(`/api/agents/${id}/pause`, { method: 'POST' }),
  activateAgent: (id) => api.request(`/api/agents/${id}/activate`, { method: 'POST' }),
  
  // Wallets  
  getWallet: (id) => api.request(`/api/wallets/${id}`),
  getWalletTransactions: (id) => api.request(`/api/wallets/${id}/transactions`),
  depositToWallet: (id, amount) => api.request(`/api/wallets/${id}/deposit`, { 
    method: 'POST', 
    body: JSON.stringify({ amount }) 
  }),
  
  // Transactions
  getPendingTransactions: () => api.request('/api/transactions/status/pending'),
  approveTransaction: (id) => api.request(`/api/transactions/${id}/approve`, { method: 'POST' }),
  rejectTransaction: (id, reason) => api.request(`/api/transactions/${id}/reject`, { 
    method: 'POST', 
    body: JSON.stringify({ reason }) 
  }),
  
  // Rules
  getRules: (walletId) => api.request(`/api/rules?walletId=${walletId}`),
};

// ============================================
// DEMO DATA
// ============================================
const demoData = {
  owner: { name: 'Jack', email: 'jack@bytem.co' },
  stats: {
    totalAgents: 3,
    activeWallets: 5,
    totalBalance: 12450.00,
    pendingApprovals: 2,
    todayTransactions: 23,
    todayVolume: 1847.50
  },
  agents: [
    { id: 'agent_1', name: 'ad-buyer-agent', status: 'ACTIVE', walletCount: 2, totalBalance: 5200, lastActive: '2 min ago', apiKeyPreview: 'ak_...x7f2' },
    { id: 'agent_2', name: 'content-writer', status: 'ACTIVE', walletCount: 1, totalBalance: 3100, lastActive: '15 min ago', apiKeyPreview: 'ak_...m3k9' },
    { id: 'agent_3', name: 'data-scraper', status: 'PAUSED', walletCount: 2, totalBalance: 4150, lastActive: '2 hours ago', apiKeyPreview: 'ak_...p2w1' }
  ],
  transactions: [
    { id: 't1', agentName: 'ad-buyer-agent', amount: 75.00, category: 'advertising', status: 'COMPLETED', time: '2 min ago', description: 'Google Ads spend', walletId: 'w1' },
    { id: 't2', agentName: 'content-writer', amount: 150.00, category: 'software', status: 'AWAITING_APPROVAL', time: '5 min ago', description: 'Jasper AI subscription', walletId: 'w2' },
    { id: 't3', agentName: 'ad-buyer-agent', amount: 45.00, category: 'advertising', status: 'COMPLETED', time: '12 min ago', description: 'Meta Ads', walletId: 'w1' },
    { id: 't4', agentName: 'data-scraper', amount: 200.00, category: 'infrastructure', status: 'AWAITING_APPROVAL', time: '1 hour ago', description: 'Proxy service renewal', walletId: 'w3' },
    { id: 't5', agentName: 'ad-buyer-agent', amount: 125.00, category: 'advertising', status: 'REJECTED', time: '2 hours ago', description: 'TikTok Ads - exceeded daily limit', walletId: 'w1' },
    { id: 't6', agentName: 'content-writer', amount: 29.00, category: 'software', status: 'COMPLETED', time: '3 hours ago', description: 'Grammarly Pro', walletId: 'w2' },
    { id: 't7', agentName: 'ad-buyer-agent', amount: 89.00, category: 'advertising', status: 'COMPLETED', time: '4 hours ago', description: 'LinkedIn Ads', walletId: 'w1' },
    { id: 't8', agentName: 'data-scraper', amount: 15.00, category: 'infrastructure', status: 'COMPLETED', time: '5 hours ago', description: 'AWS Lambda', walletId: 'w3' },
  ],
  pendingApprovals: [
    { 
      id: 't2', 
      agentName: 'content-writer', 
      agentId: 'agent_2',
      amount: 150.00, 
      category: 'software', 
      description: 'Jasper AI subscription',
      reason: 'Exceeds approval threshold of $100',
      time: '5 min ago',
      walletBalance: 3100
    },
    { 
      id: 't4', 
      agentName: 'data-scraper', 
      agentId: 'agent_3',
      amount: 200.00, 
      category: 'infrastructure', 
      description: 'Proxy service renewal',
      reason: 'Exceeds approval threshold of $100',
      time: '1 hour ago',
      walletBalance: 4150
    }
  ],
  rules: [
    { id: 'r1', type: 'PER_TRANSACTION_LIMIT', params: { limit: 100 }, agentName: 'ad-buyer-agent', walletId: 'w1', active: true },
    { id: 'r2', type: 'DAILY_LIMIT', params: { limit: 500 }, agentName: 'ad-buyer-agent', walletId: 'w1', active: true },
    { id: 'r3', type: 'REQUIRES_APPROVAL', params: { threshold: 75 }, agentName: 'ad-buyer-agent', walletId: 'w1', active: true },
    { id: 'r4', type: 'CATEGORY_WHITELIST', params: { categories: ['advertising', 'software'] }, agentName: 'content-writer', walletId: 'w2', active: true },
    { id: 'r5', type: 'MONTHLY_LIMIT', params: { limit: 2000 }, agentName: 'content-writer', walletId: 'w2', active: false },
    { id: 'r6', type: 'TIME_WINDOW', params: { startHour: 9, endHour: 17 }, agentName: 'data-scraper', walletId: 'w3', active: true },
  ]
};

// ============================================
// COMPONENTS
// ============================================

// Status Badge
const StatusBadge = ({ status }) => {
  const config = {
    ACTIVE: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', icon: Activity },
    PAUSED: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', icon: Clock },
    SUSPENDED: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', icon: XCircle },
    COMPLETED: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', icon: CheckCircle },
    AWAITING_APPROVAL: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', icon: AlertCircle },
    REJECTED: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', icon: XCircle },
    PENDING: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', icon: Clock }
  };
  
  const { bg, text, border, icon: Icon } = config[status] || config.PENDING;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${bg} ${text} ${border}`}>
      <Icon size={12} />
      {status.replace(/_/g, ' ')}
    </span>
  );
};

// Metric Card
const MetricCard = ({ icon: Icon, label, value, subValue, trend, loading }) => (
  <div className="metric-card group">
    <div className="flex items-start justify-between">
      <div className="metric-icon">
        <Icon size={20} />
      </div>
      {trend !== undefined && (
        <span className={`flex items-center text-xs font-medium ${trend > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {trend > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {Math.abs(trend)}%
        </span>
      )}
    </div>
    <div className="mt-4">
      {loading ? (
        <div className="h-8 w-24 bg-slate-700/50 rounded animate-pulse" />
      ) : (
        <p className="text-2xl font-bold text-white">{value}</p>
      )}
      <p className="text-sm text-slate-400 mt-1">{label}</p>
    </div>
    {subValue && <p className="text-xs text-slate-500 mt-2">{subValue}</p>}
  </div>
);

// Navigation Item
const NavItem = ({ icon: Icon, label, active, onClick, badge, badgeColor = 'slate' }) => (
  <button 
    className={`nav-item ${active ? 'active' : ''}`} 
    onClick={onClick}
  >
    <Icon size={18} />
    <span>{label}</span>
    {badge !== undefined && badge > 0 && (
      <span className={`nav-badge ${badgeColor === 'amber' ? 'nav-badge-amber' : ''}`}>
        {badge}
      </span>
    )}
  </button>
);

// Loading Spinner
const LoadingSpinner = ({ size = 20 }) => (
  <Loader2 size={size} className="animate-spin text-indigo-400" />
);

// Connection Status Indicator
const ConnectionStatus = ({ connected, demoMode }) => (
  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
    demoMode 
      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
      : connected 
        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
        : 'bg-red-500/20 text-red-400 border border-red-500/30'
  }`}>
    {demoMode ? (
      <>
        <Database size={12} />
        Demo
      </>
    ) : connected ? (
      <>
        <Activity size={12} />
        Live
      </>
    ) : (
      <>
        <WifiOff size={12} />
        Offline
      </>
    )}
  </div>
);

// Toast Component
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const colors = {
    success: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400',
    error: 'bg-red-500/20 border-red-500/30 text-red-400',
    info: 'bg-blue-500/20 border-blue-500/30 text-blue-400',
  };

  return (
    <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg border ${colors[type]} animate-slide-up flex items-center gap-2`}>
      {type === 'success' && <CheckCircle size={16} />}
      {type === 'error' && <XCircle size={16} />}
      {type === 'info' && <AlertCircle size={16} />}
      {message}
    </div>
  );
};

// Overview Tab
const OverviewTab = ({ data, loading, setActiveTab, onRefresh }) => (
  <>
    {/* Stats Grid */}
    <div className="stats-grid">
      <MetricCard 
        icon={Bot} 
        label="Total Agents" 
        value={data.stats.totalAgents} 
        loading={loading}
      />
      <MetricCard 
        icon={Wallet} 
        label="Active Wallets" 
        value={data.stats.activeWallets}
        loading={loading}
      />
      <MetricCard 
        icon={DollarSign} 
        label="Total Balance" 
        value={`$${data.stats.totalBalance.toLocaleString()}`}
        trend={12}
        loading={loading}
      />
      <MetricCard 
        icon={AlertCircle} 
        label="Pending Approvals" 
        value={data.stats.pendingApprovals}
        loading={loading}
      />
    </div>

    {/* Activity Section */}
    <div className="grid-2-col">
      {/* Recent Transactions */}
      <div className="card">
        <div className="card-header">
          <h3>Recent Activity</h3>
          <button className="btn-text" onClick={() => setActiveTab('transactions')}>
            View all <ChevronRight size={16} />
          </button>
        </div>
        <div className="transaction-list">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size={32} />
            </div>
          ) : (
            data.transactions.slice(0, 5).map(tx => (
              <div key={tx.id} className="transaction-item">
                <div className="transaction-icon">
                  {tx.status === 'COMPLETED' ? (
                    <ArrowUpRight size={16} className="text-emerald-400" />
                  ) : tx.status === 'REJECTED' ? (
                    <XCircle size={16} className="text-red-400" />
                  ) : (
                    <Clock size={16} className="text-amber-400" />
                  )}
                </div>
                <div className="transaction-details">
                  <p className="transaction-desc">{tx.description}</p>
                  <p className="transaction-meta">{tx.agentName} • {tx.time}</p>
                </div>
                <div className="transaction-amount">
                  <p className={tx.status === 'REJECTED' ? 'text-red-400 line-through' : ''}>
                    ${tx.amount.toFixed(2)}
                  </p>
                  <StatusBadge status={tx.status} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Pending Approvals */}
      <div className="card">
        <div className="card-header">
          <h3>Needs Approval</h3>
          <button className="btn-text" onClick={() => setActiveTab('approvals')}>
            Review all <ChevronRight size={16} />
          </button>
        </div>
        {data.pendingApprovals.length === 0 ? (
          <div className="empty-state">
            <CheckCircle size={40} className="text-emerald-400" />
            <p>All caught up!</p>
          </div>
        ) : (
          <div className="approval-list">
            {data.pendingApprovals.slice(0, 3).map(item => (
              <div key={item.id} className="approval-item">
                <div className="approval-header">
                  <span className="approval-agent">{item.agentName}</span>
                  <span className="approval-amount">${item.amount.toFixed(2)}</span>
                </div>
                <p className="approval-desc">{item.description}</p>
                <p className="approval-reason">{item.reason}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>

    {/* Agents Overview */}
    <div className="card">
      <div className="card-header">
        <h3>Agent Overview</h3>
        <button className="btn-text" onClick={() => setActiveTab('agents')}>
          Manage agents <ChevronRight size={16} />
        </button>
      </div>
      <div className="agents-grid">
        {data.agents.map(agent => (
          <div key={agent.id} className="agent-card-mini">
            <div className="agent-card-header">
              <div className="agent-avatar">
                <Bot size={20} />
              </div>
              <StatusBadge status={agent.status} />
            </div>
            <h4 className="agent-name">{agent.name}</h4>
            <div className="agent-stats">
              <div>
                <p className="stat-value">${agent.totalBalance.toLocaleString()}</p>
                <p className="stat-label">Balance</p>
              </div>
              <div>
                <p className="stat-value">{agent.walletCount}</p>
                <p className="stat-label">Wallets</p>
              </div>
            </div>
            <p className="agent-last-active">Last active: {agent.lastActive}</p>
          </div>
        ))}
      </div>
    </div>
  </>
);

// Agents Tab
const AgentsTab = ({ agents, loading, onPauseAgent, onActivateAgent, onCreateAgent }) => {
  const [showApiKey, setShowApiKey] = useState({});

  return (
    <div className="card">
      <div className="card-header">
        <h3>All Agents ({agents.length})</h3>
        <div className="header-actions">
          <button className="btn-secondary">
            <Filter size={16} />
            Filter
          </button>
          <button className="btn-primary" onClick={onCreateAgent}>
            <Plus size={16} />
            Create Agent
          </button>
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner size={32} />
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Status</th>
              <th>API Key</th>
              <th>Wallets</th>
              <th>Total Balance</th>
              <th>Last Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {agents.map(agent => (
              <tr key={agent.id}>
                <td>
                  <div className="agent-cell">
                    <div className="agent-avatar-sm">
                      <Bot size={16} />
                    </div>
                    <div>
                      <span className="font-medium">{agent.name}</span>
                      <p className="text-xs text-slate-500">{agent.id}</p>
                    </div>
                  </div>
                </td>
                <td><StatusBadge status={agent.status} /></td>
                <td>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-slate-800 px-2 py-1 rounded">
                      {showApiKey[agent.id] ? 'ak_demo_' + agent.id.slice(-8) : agent.apiKeyPreview || '••••••••'}
                    </code>
                    <button 
                      className="text-slate-500 hover:text-slate-300 transition-colors"
                      onClick={() => setShowApiKey(prev => ({ ...prev, [agent.id]: !prev[agent.id] }))}
                    >
                      {showApiKey[agent.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </td>
                <td>{agent.walletCount}</td>
                <td className="font-mono">${agent.totalBalance.toLocaleString()}</td>
                <td className="text-slate-400">{agent.lastActive}</td>
                <td>
                  <div className="action-buttons">
                    <button className="btn-sm">View</button>
                    <button 
                      className="btn-sm btn-outline"
                      onClick={() => agent.status === 'ACTIVE' ? onPauseAgent(agent.id) : onActivateAgent(agent.id)}
                    >
                      {agent.status === 'ACTIVE' ? 'Pause' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

// Transactions Tab
const TransactionsTab = ({ transactions, loading }) => {
  const [filter, setFilter] = useState('all');
  
  const filteredTransactions = filter === 'all' 
    ? transactions 
    : transactions.filter(tx => tx.status === filter);

  return (
    <div className="card">
      <div className="card-header">
        <h3>Transaction History ({filteredTransactions.length})</h3>
        <div className="header-actions">
          <div className="flex gap-2">
            {['all', 'COMPLETED', 'AWAITING_APPROVAL', 'REJECTED'].map(status => (
              <button 
                key={status}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filter === status 
                    ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' 
                    : 'bg-slate-800 text-slate-400 border border-transparent hover:border-slate-700'
                }`}
                onClick={() => setFilter(status)}
              >
                {status === 'all' ? 'All' : status.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner size={32} />
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Agent</th>
              <th>Category</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.map(tx => (
              <tr key={tx.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      tx.status === 'COMPLETED' ? 'bg-emerald-500/20' : 
                      tx.status === 'REJECTED' ? 'bg-red-500/20' : 'bg-amber-500/20'
                    }`}>
                      {tx.status === 'COMPLETED' ? (
                        <CheckCircle size={14} className="text-emerald-400" />
                      ) : tx.status === 'REJECTED' ? (
                        <XCircle size={14} className="text-red-400" />
                      ) : (
                        <Clock size={14} className="text-amber-400" />
                      )}
                    </div>
                    {tx.description}
                  </div>
                </td>
                <td className="text-slate-400">{tx.agentName}</td>
                <td>
                  <span className="category-badge">{tx.category}</span>
                </td>
                <td className={`font-mono ${tx.status === 'REJECTED' ? 'text-red-400 line-through' : ''}`}>
                  ${tx.amount.toFixed(2)}
                </td>
                <td><StatusBadge status={tx.status} /></td>
                <td className="text-slate-400">{tx.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

// Approvals Tab
const ApprovalsTab = ({ approvals, loading, onApprove, onReject }) => {
  const [processingId, setProcessingId] = useState(null);

  const handleApprove = async (id) => {
    setProcessingId(id);
    await onApprove(id);
    setProcessingId(null);
  };

  const handleReject = async (id) => {
    setProcessingId(id);
    await onReject(id);
    setProcessingId(null);
  };

  if (loading) {
    return (
      <div className="card flex items-center justify-center py-16">
        <LoadingSpinner size={32} />
      </div>
    );
  }

  if (approvals.length === 0) {
    return (
      <div className="card empty-state-large">
        <CheckCircle size={60} className="text-emerald-400" />
        <h3>All caught up!</h3>
        <p>No transactions pending approval</p>
      </div>
    );
  }

  return (
    <div className="approvals-container">
      {approvals.map(item => (
        <div key={item.id} className="approval-card">
          <div className="approval-card-header">
            <div className="approval-agent-info">
              <div className="agent-avatar">
                <Bot size={20} />
              </div>
              <div>
                <h4>{item.agentName}</h4>
                <p className="text-slate-400 text-sm">{item.time}</p>
              </div>
            </div>
            <div className="approval-amount-large">
              ${item.amount.toFixed(2)}
            </div>
          </div>
          
          <div className="approval-card-body">
            <div className="approval-detail">
              <span className="detail-label">Description</span>
              <span className="detail-value">{item.description}</span>
            </div>
            <div className="approval-detail">
              <span className="detail-label">Category</span>
              <span className="category-badge">{item.category}</span>
            </div>
            <div className="approval-detail">
              <span className="detail-label">Wallet Balance</span>
              <span className="detail-value font-mono">${item.walletBalance?.toLocaleString() || 'N/A'}</span>
            </div>
            <div className="approval-detail">
              <span className="detail-label">Flagged Reason</span>
              <span className="detail-value text-amber-400">{item.reason}</span>
            </div>
          </div>

          <div className="approval-card-actions">
            <button 
              className="btn-reject-large" 
              onClick={() => handleReject(item.id)}
              disabled={processingId === item.id}
            >
              {processingId === item.id ? <LoadingSpinner size={18} /> : <XCircle size={18} />}
              Reject
            </button>
            <button 
              className="btn-approve-large" 
              onClick={() => handleApprove(item.id)}
              disabled={processingId === item.id}
            >
              {processingId === item.id ? <LoadingSpinner size={18} /> : <CheckCircle size={18} />}
              Approve
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

// Rules Tab
const RulesTab = ({ rules, loading }) => {
  const ruleDescriptions = {
    PER_TRANSACTION_LIMIT: 'Maximum amount for a single transaction',
    DAILY_LIMIT: 'Maximum total spend per day',
    WEEKLY_LIMIT: 'Maximum total spend per week',
    MONTHLY_LIMIT: 'Maximum total spend per month',
    CATEGORY_WHITELIST: 'Only allow specific spending categories',
    CATEGORY_BLACKLIST: 'Block specific spending categories',
    RECIPIENT_WHITELIST: 'Only allow specific recipients',
    RECIPIENT_BLACKLIST: 'Block specific recipients',
    TIME_WINDOW: 'Only allow transactions during certain hours',
    REQUIRES_APPROVAL: 'Require manual approval above threshold',
  };

  const formatParams = (type, params) => {
    if (type.includes('LIMIT')) return `$${params.limit}`;
    if (type.includes('WHITELIST') || type.includes('BLACKLIST')) return params.categories?.join(', ') || params.recipients?.join(', ');
    if (type === 'TIME_WINDOW') return `${params.startHour}:00 - ${params.endHour}:00`;
    if (type === 'REQUIRES_APPROVAL') return `> $${params.threshold}`;
    return JSON.stringify(params);
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3>Spend Rules ({rules.length})</h3>
        <button className="btn-primary">
          <Plus size={16} />
          Add Rule
        </button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner size={32} />
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Rule Type</th>
              <th>Description</th>
              <th>Value</th>
              <th>Agent</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map(rule => (
              <tr key={rule.id} className={!rule.active ? 'opacity-50' : ''}>
                <td>
                  <div className="flex items-center gap-2">
                    <Shield size={16} className="text-indigo-400" />
                    <span className="rule-type">{rule.type.replace(/_/g, ' ')}</span>
                  </div>
                </td>
                <td className="text-slate-400 text-sm">
                  {ruleDescriptions[rule.type] || 'Custom rule'}
                </td>
                <td className="font-mono text-sm text-emerald-400">
                  {formatParams(rule.type, rule.params)}
                </td>
                <td className="text-slate-400">{rule.agentName}</td>
                <td>
                  <span className={`status-dot ${rule.active ? 'active' : 'inactive'}`}>
                    {rule.active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td>
                  <div className="action-buttons">
                    <button className="btn-sm">Edit</button>
                    <button className="btn-sm btn-outline">
                      {rule.active ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

// ============================================
// MAIN APP
// ============================================
export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [data, setData] = useState(demoData);
  const [loading, setLoading] = useState(false);
  const [demoMode, setDemoMode] = useState(DEMO_MODE_DEFAULT);
  const [connected, setConnected] = useState(false);
  const [toast, setToast] = useState(null);

  // Check API connection
  const checkConnection = useCallback(async () => {
    try {
      await api.health();
      setConnected(true);
      return true;
    } catch {
      setConnected(false);
      return false;
    }
  }, []);

  // Fetch data from API
  const fetchData = useCallback(async () => {
    if (demoMode) return;
    
    setLoading(true);
    try {
      const [agentsRes, pendingRes] = await Promise.all([
        api.getAgents(),
        api.getPendingTransactions(),
      ]);
      
      // Transform API response to match our data structure
      setData(prev => ({
        ...prev,
        agents: agentsRes.agents || [],
        pendingApprovals: pendingRes.transactions || [],
        stats: {
          ...prev.stats,
          totalAgents: agentsRes.agents?.length || 0,
          pendingApprovals: pendingRes.pendingCount || 0,
        }
      }));
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setDemoMode(true);
    } finally {
      setLoading(false);
    }
  }, [demoMode]);

  // Initial connection check
  useEffect(() => {
    checkConnection().then(isConnected => {
      if (isConnected && !demoMode) {
        fetchData();
      }
    });
  }, [checkConnection, demoMode, fetchData]);

  // Toast helper
  const showToast = (message, type = 'info') => {
    setToast({ message, type });
  };

  // Action handlers
  const handleApprove = async (id) => {
    if (demoMode) {
      setData(prev => ({
        ...prev,
        pendingApprovals: prev.pendingApprovals.filter(a => a.id !== id),
        transactions: prev.transactions.map(t => 
          t.id === id ? { ...t, status: 'COMPLETED' } : t
        ),
        stats: { ...prev.stats, pendingApprovals: prev.stats.pendingApprovals - 1 }
      }));
      showToast('Transaction approved', 'success');
      return;
    }
    
    try {
      await api.approveTransaction(id);
      await fetchData();
      showToast('Transaction approved', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  const handleReject = async (id) => {
    if (demoMode) {
      setData(prev => ({
        ...prev,
        pendingApprovals: prev.pendingApprovals.filter(a => a.id !== id),
        transactions: prev.transactions.map(t => 
          t.id === id ? { ...t, status: 'REJECTED' } : t
        ),
        stats: { ...prev.stats, pendingApprovals: prev.stats.pendingApprovals - 1 }
      }));
      showToast('Transaction rejected', 'success');
      return;
    }
    
    try {
      await api.rejectTransaction(id, 'Rejected by owner');
      await fetchData();
      showToast('Transaction rejected', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  const handlePauseAgent = async (id) => {
    if (demoMode) {
      setData(prev => ({
        ...prev,
        agents: prev.agents.map(a => a.id === id ? { ...a, status: 'PAUSED' } : a)
      }));
      showToast('Agent paused', 'success');
      return;
    }
    
    try {
      await api.pauseAgent(id);
      await fetchData();
      showToast('Agent paused', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  const handleActivateAgent = async (id) => {
    if (demoMode) {
      setData(prev => ({
        ...prev,
        agents: prev.agents.map(a => a.id === id ? { ...a, status: 'ACTIVE' } : a)
      }));
      showToast('Agent activated', 'success');
      return;
    }
    
    try {
      await api.activateAgent(id);
      await fetchData();
      showToast('Agent activated', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  const handleCreateAgent = () => {
    showToast('Create agent modal coming soon', 'info');
  };

  const toggleDemoMode = async () => {
    if (demoMode) {
      const isConnected = await checkConnection();
      if (isConnected) {
        setDemoMode(false);
        fetchData();
        showToast('Switched to live mode', 'success');
      } else {
        showToast('API not available. Start the SDK server first.', 'error');
      }
    } else {
      setDemoMode(true);
      setData(demoData);
      showToast('Switched to demo mode', 'info');
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-icon">
              <Wallet size={20} />
            </div>
            <span className="logo-text">AgentWallet</span>
            <span className={`inline-block w-2 h-2 rounded-full ml-2 ${connected ? 'bg-emerald-400' : 'bg-amber-400'}`} title={connected ? 'Live' : 'Demo'} />
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavItem 
            icon={Activity} 
            label="Overview" 
            active={activeTab === 'overview'} 
            onClick={() => setActiveTab('overview')} 
          />
          <NavItem 
            icon={Bot} 
            label="Agents" 
            active={activeTab === 'agents'} 
            onClick={() => setActiveTab('agents')}
            badge={data.stats.totalAgents}
          />
          <NavItem 
            icon={Wallet} 
            label="Wallets" 
            active={activeTab === 'wallets'} 
            onClick={() => setActiveTab('wallets')} 
          />
          <NavItem 
            icon={TrendingUp} 
            label="Transactions" 
            active={activeTab === 'transactions'} 
            onClick={() => setActiveTab('transactions')} 
          />
          <NavItem 
            icon={AlertCircle} 
            label="Approvals" 
            active={activeTab === 'approvals'} 
            onClick={() => setActiveTab('approvals')}
            badge={data.stats.pendingApprovals}
            badgeColor="amber"
          />
          <NavItem 
            icon={Shield} 
            label="Rules" 
            active={activeTab === 'rules'} 
            onClick={() => setActiveTab('rules')} 
          />
          <NavItem 
            icon={Zap} 
            label="Kalshi Trading" 
            active={activeTab === 'kalshi'} 
            onClick={() => setActiveTab('kalshi')} 
          />
          <NavItem 
            icon={Eye} 
            label="Governance" 
            active={activeTab === 'governance'} 
            onClick={() => setActiveTab('governance')} 
          />
          <NavItem 
            icon={Rss} 
            label="Live Feed" 
            active={activeTab === 'livefeed'} 
            onClick={() => setActiveTab('livefeed')} 
          />
        </nav>

        <div className="sidebar-footer">
          <NavItem icon={Settings} label="Settings" onClick={() => {}} />

          <div className="user-card">
            <div className="user-avatar">{data.owner.name[0]}</div>
            <div className="user-info">
              <p className="user-name">{data.owner.name}</p>
              <p className="user-email">{data.owner.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Header */}
        <header className="main-header">
          <div>
            <h1 className="page-title">
              {activeTab === 'overview' && 'Dashboard'}
              {activeTab === 'agents' && 'AI Agents'}
              {activeTab === 'wallets' && 'Wallets'}
              {activeTab === 'transactions' && 'Transactions'}
              {activeTab === 'approvals' && 'Pending Approvals'}
              {activeTab === 'rules' && 'Spend Rules'}
              {activeTab === 'kalshi' && 'Kalshi Trading'}
              {activeTab === 'governance' && 'Governance Engine'}
              {activeTab === 'livefeed' && 'Live Feed'}
            </h1>
            <p className="page-subtitle">
              {activeTab === 'overview' && 'Monitor your AI agent financial activity'}
              {activeTab === 'agents' && 'Manage your AI agents and their permissions'}
              {activeTab === 'wallets' && 'View and manage agent wallets'}
              {activeTab === 'transactions' && 'Complete transaction history'}
              {activeTab === 'approvals' && `${data.stats.pendingApprovals} transactions need your review`}
              {activeTab === 'rules' && 'Configure spend policies and guardrails'}
              {activeTab === 'kalshi' && 'AI agent prediction market trading with guardrails'}
              {activeTab === 'governance' && 'Signal evaluation, rules engine, and audit trail'}
              {activeTab === 'livefeed' && 'Public activity feed and tweet generator'}
            </p>
          </div>
          <div className="header-actions">
            <button className="btn-icon">
              <Search size={18} />
            </button>
            <button className="btn-icon notification-btn">
              <Bell size={18} />
              {data.stats.pendingApprovals > 0 && <span className="notification-dot" />}
            </button>
            <button className="btn-primary" onClick={handleCreateAgent}>
              <Plus size={16} />
              New Agent
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="content-area">
          {activeTab === 'overview' && (
            <OverviewTab 
              data={data} 
              loading={loading}
              setActiveTab={setActiveTab}
              onRefresh={fetchData}
            />
          )}
          {activeTab === 'agents' && (
            <AgentsTab 
              agents={data.agents}
              loading={loading}
              onPauseAgent={handlePauseAgent}
              onActivateAgent={handleActivateAgent}
              onCreateAgent={handleCreateAgent}
            />
          )}
          {activeTab === 'transactions' && (
            <TransactionsTab 
              transactions={data.transactions}
              loading={loading}
            />
          )}
          {activeTab === 'approvals' && (
            <ApprovalsTab 
              approvals={data.pendingApprovals}
              loading={loading}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          )}
          {activeTab === 'rules' && (
            <RulesTab 
              rules={data.rules}
              loading={loading}
            />
          )}
          {activeTab === 'wallets' && (
            <div className="card empty-state-large">
              <Wallet size={60} className="text-indigo-400" />
              <h3>Wallets View</h3>
              <p>Coming soon - View all wallets across agents</p>
            </div>
          )}
          {activeTab === 'kalshi' && (
            <KalshiTradingDashboard />
          )}
          {activeTab === 'governance' && (
            <AgentWalletGovernanceDashboard />
          )}
          {activeTab === 'livefeed' && (
            <LiveFeedDashboard />
          )}
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}

      {/* Custom Styles */}
      <style>{`
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}