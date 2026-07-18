import { ArrowLeft, Search, QrCode, Gift, User, CreditCard, AlertCircle, ChevronDown, Send } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router";
import { useState } from "react";
import irizonLogo from "../../assets/5aa002f17312914e5df436969532bb9f94818e7a.png";

interface Category {
  id: string;
  title: string;
  icon: typeof QrCode;
  bgColor: string;
  iconColor: string;
}

interface Question {
  id: string;
  question: string;
  answer: string;
  categoryId: string;
}

const categories: Category[] = [
  {
    id: "qr",
    title: "QR Scanning",
    icon: QrCode,
    bgColor: "#EEF4FF",
    iconColor: "#2F80ED",
  },
  {
    id: "rewards",
    title: "Points & Rewards",
    icon: Gift,
    bgColor: "#F3EEFF",
    iconColor: "#7B61FF",
  },
  {
    id: "gifts",
    title: "Redeeming Gifts",
    icon: Gift,
    bgColor: "#FEF3F2",
    iconColor: "#F97066",
  },
  {
    id: "account",
    title: "Account",
    icon: User,
    bgColor: "#F5F5F5",
    iconColor: "#6B7280",
  },
  {
    id: "payments",
    title: "Payments",
    icon: CreditCard,
    bgColor: "#E8F7EE",
    iconColor: "#2FBF71",
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    icon: AlertCircle,
    bgColor: "#FFF4ED",
    iconColor: "#F79009",
  },
];

const questions: Question[] = [
  {
    id: "q1",
    question: "How do I scan a QR code?",
    answer: "Open the IRIZON app and tap the Scan QR button on the home screen. Point your camera at the QR code at the partner location to receive loyalty points instantly.",
    categoryId: "qr",
  },
  {
    id: "q2",
    question: "How many points do I earn?",
    answer: "You earn points based on your purchases at partner locations. The amount varies by partner and purchase value. Check the Rewards section for current point rates.",
    categoryId: "rewards",
  },
  {
    id: "q3",
    question: "How can I redeem rewards?",
    answer: "Go to the Rewards Store, browse available items, and tap on any reward you'd like to redeem. You'll need enough points in your balance to complete the redemption.",
    categoryId: "gifts",
  },
  {
    id: "q4",
    question: "Do points expire?",
    answer: "Points are valid for 12 months from the date they are earned. You'll receive notifications before your points expire so you have time to redeem them.",
    categoryId: "rewards",
  },
  {
    id: "q5",
    question: "Why didn't I receive points?",
    answer: "If you didn't receive points after scanning a QR code, please check your internet connection and try again. If the issue persists, contact our support team via Telegram.",
    categoryId: "troubleshooting",
  },
  {
    id: "q6",
    question: "How do I update my account information?",
    answer: "Navigate to Profile → Settings → Edit Profile. You can update your personal information, phone number, and other account details there.",
    categoryId: "account",
  },
  {
    id: "q7",
    question: "What payment methods are supported?",
    answer: "We support Click, Payme, and bank transfers for purchasing points in the Market section. All transactions are secure and encrypted.",
    categoryId: "payments",
  },
  {
    id: "q8",
    question: "Can I transfer points to another user?",
    answer: "Currently, points cannot be transferred between users. Points are tied to individual accounts and can only be redeemed by the account holder.",
    categoryId: "rewards",
  },
];

export function KnowledgeBase() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);

  const toggleQuestion = (id: string) => {
    setExpandedQuestion(expandedQuestion === id ? null : id);
  };

  const filteredQuestions = questions.filter((q) => {
    const matchesSearch = q.question.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         q.answer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || q.categoryId === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleContactSupport = () => {
    window.open("https://t.me/irizon_manager", "_blank");
  };

  return (
    <div className="min-h-screen bg-[#F5F7FB] pb-8">
      {/* Compact Hero Header */}
      <div className="bg-gradient-to-br from-[#2F80ED] to-[#4A6CF7] px-5 pt-6 pb-8 relative overflow-hidden">
        {/* Background Pattern - 10% opacity */}
        <div className="absolute inset-0 opacity-10">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
              backgroundSize: "24px 24px",
            }}
          />
        </div>

        {/* Header Content */}
        <div className="relative">
          {/* Top Bar */}
          <div className="flex items-center justify-between mb-6">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </motion.button>
            <img src={irizonLogo} alt="IRIZON" className="h-6 w-auto" />
            <div className="w-10" /> {/* Spacer */}
          </div>

          {/* Hero Title */}
          <div className="space-y-1.5">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-white font-semibold"
              style={{ fontSize: '22px' }}
            >
              Knowledge Base
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-white/90 font-normal"
              style={{ fontSize: '14px' }}
            >
              Find answers to common questions
            </motion.p>
          </div>
        </div>
      </div>

      {/* Main Content - 20px padding */}
      <div className="px-5">
        {/* Search Field - 16px from header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="-mt-6 relative z-10"
        >
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search help topics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#F6F8FB] rounded-2xl pl-11 pr-4 text-gray-900 placeholder-gray-400 border border-gray-200/50 focus:border-[#2F80ED] focus:outline-none transition-all shadow-sm"
              style={{ height: '48px', fontSize: '15px' }}
            />
          </div>
        </motion.div>

        {/* Categories Section - 24px from search */}
        <div className="mt-6">
          <h2 className="text-gray-900 font-semibold mb-4" style={{ fontSize: '18px' }}>
            Categories
          </h2>
          
          {/* Horizontal Scroll Categories */}
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5 scrollbar-hide">
            {categories.map((category, index) => {
              const Icon = category.icon;
              const isSelected = selectedCategory === category.id;
              
              return (
                <motion.button
                  key={category.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 + index * 0.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedCategory(isSelected ? null : category.id)}
                  className="flex-shrink-0 bg-white rounded-2xl p-3 text-center transition-all"
                  style={{
                    width: '90px',
                    height: '80px',
                    boxShadow: isSelected 
                      ? "0 4px 12px rgba(47, 128, 237, 0.2)" 
                      : "0 1px 3px rgba(0, 0, 0, 0.04)",
                    border: isSelected ? "2px solid #2F80ED" : "2px solid transparent",
                  }}
                >
                  <div className="flex flex-col items-center justify-center h-full gap-2">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: category.bgColor }}
                    >
                      <Icon className="w-4 h-4" style={{ color: category.iconColor }} strokeWidth={2} />
                    </div>
                    <span className="text-gray-700 font-medium text-xs leading-tight">
                      {category.title}
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Popular Questions Section - 24px spacing */}
        <div className="mt-6">
          <h2 className="text-gray-900 font-semibold mb-4" style={{ fontSize: '18px' }}>
            {selectedCategory 
              ? `${categories.find(c => c.id === selectedCategory)?.title} Questions`
              : "Popular Questions"}
          </h2>

          {/* Accordion Questions */}
          <div className="space-y-3">
            {filteredQuestions.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 text-center">
                <p className="text-gray-500 text-sm">No questions found matching your search.</p>
              </div>
            ) : (
              filteredQuestions.map((question, index) => {
                const isExpanded = expandedQuestion === question.id;
                
                return (
                  <motion.div
                    key={question.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.4 + index * 0.05 }}
                  >
                    <button
                      onClick={() => toggleQuestion(question.id)}
                      className="w-full bg-white rounded-2xl p-4 text-left transition-shadow"
                      style={{
                        boxShadow: isExpanded 
                          ? "0 4px 12px rgba(0, 0, 0, 0.08)" 
                          : "0 1px 3px rgba(0, 0, 0, 0.04)"
                      }}
                    >
                      {/* Question Header */}
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-gray-900 font-medium flex-1" style={{ fontSize: '15px' }}>
                          {question.question}
                        </h3>
                        <motion.div
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        </motion.div>
                      </div>

                      {/* Answer - Animated */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="overflow-hidden"
                          >
                            <p className="text-gray-600 mt-3 leading-relaxed" style={{ fontSize: '14px' }}>
                              {question.answer}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </button>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>

        {/* Contact Support Section - 24px spacing */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mt-6"
        >
          <div className="bg-white rounded-2xl p-5 text-center" style={{ boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)" }}>
            <h3 className="text-gray-900 font-semibold mb-2" style={{ fontSize: '18px' }}>
              Still need help?
            </h3>
            <p className="text-gray-500 mb-4 text-sm">
              Our managers usually reply within 10 minutes
            </p>
            
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleContactSupport}
              className="w-full bg-gradient-to-br from-[#2F80ED] to-[#4A6CF7] rounded-2xl flex items-center justify-center gap-2 text-white font-semibold transition-shadow"
              style={{ 
                height: '48px',
                boxShadow: "0 4px 12px rgba(47, 128, 237, 0.25)"
              }}
            >
              <Send className="w-5 h-5" strokeWidth={2} />
              <span>Contact Telegram Support</span>
            </motion.button>
          </div>
        </motion.div>
      </div>

      {/* Custom scrollbar hide */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}


