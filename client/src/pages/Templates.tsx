/**
 * Q Workspace — Templates Gallery
 * 10 real project templates with stunning card layout
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { TopNav } from "@/components/TopNav";
import { useLocation } from "wouter";
import { useProjectStore } from "@/stores";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Users, BarChart3, Church, UtensilsCrossed, Home as HomeIcon,
  Target, Briefcase, ShoppingCart, Rocket, FileText,
  ArrowRight, Sparkles, Loader2,
} from "lucide-react";
import { duration, ease } from "@/lib/motion";

interface Template {
  id: string;
  name: string;
  description: string;
  icon: any;
  color: string;
  glow: string;
  prompt: string;
  category: string;
}

const TEMPLATES: Template[] = [
  {
    id: "contractor-crm",
    name: "Contractor CRM",
    description: "Client management, job scheduling, invoicing, and crew coordination for contractors",
    icon: Users,
    color: "#3B82F6",
    glow: "rgba(59,130,246,0.3)",
    prompt: "Build a Contractor CRM web application with: client database with contact info and job history, job scheduling calendar with crew assignment, invoice generation and payment tracking, project photo gallery, material cost tracking, and a responsive dashboard showing active jobs, upcoming deadlines, and revenue metrics. Use React + Tailwind with a professional blue/slate color scheme.",
    category: "Business",
  },
  {
    id: "ai-saas-dashboard",
    name: "AI SaaS Dashboard",
    description: "Analytics dashboard for AI/ML products with usage metrics, model performance, and billing",
    icon: BarChart3,
    color: "#8B5CF6",
    glow: "rgba(139,92,246,0.3)",
    prompt: "Build an AI SaaS Dashboard with: real-time API usage metrics and charts, model performance monitoring (latency, accuracy, error rates), user management with tier-based access, billing overview with usage-based pricing display, API key management, webhook configuration, and a modern dark-themed UI with gradient accents. Use React + Tailwind + Chart.js with purple/indigo color scheme.",
    category: "SaaS",
  },
  {
    id: "church-management",
    name: "Church Management",
    description: "Member directory, event scheduling, donations tracking, and volunteer coordination",
    icon: Church,
    color: "#F59E0B",
    glow: "rgba(245,158,11,0.3)",
    prompt: "Build a Church Management System with: member directory with families and groups, event calendar with RSVP and volunteer sign-up, donation tracking with giving history and tax receipts, sermon archive with audio/video links, small group management, prayer request board, and announcements. Use React + Tailwind with a warm, welcoming design using amber/cream colors.",
    category: "Community",
  },
  {
    id: "restaurant-ordering",
    name: "Restaurant Ordering",
    description: "Online menu, ordering system, table reservations, and kitchen display",
    icon: UtensilsCrossed,
    color: "#EF4444",
    glow: "rgba(239,68,68,0.3)",
    prompt: "Build a Restaurant Ordering App with: digital menu with categories, photos, and dietary tags, online ordering with cart and checkout, table reservation system, order status tracking for customers, kitchen display system for staff, daily specials management, and customer reviews. Use React + Tailwind with a rich, appetizing design using warm reds and dark backgrounds.",
    category: "Food & Beverage",
  },
  {
    id: "roofing-operations",
    name: "Roofing Operations",
    description: "Job estimation, crew scheduling, material ordering, and weather-aware planning",
    icon: HomeIcon,
    color: "#10B981",
    glow: "rgba(16,185,129,0.3)",
    prompt: "Build a Roofing Operations Platform with: job estimation calculator (roof area, materials, labor), crew scheduling with availability tracking, material inventory and ordering, weather forecast integration for job planning, before/after photo documentation, customer communication portal, and financial reporting. Use React + Tailwind with a professional green/slate color scheme.",
    category: "Construction",
  },
  {
    id: "lead-generation",
    name: "Lead Generation",
    description: "Landing pages, form builders, lead scoring, email sequences, and conversion tracking",
    icon: Target,
    color: "#EC4899",
    glow: "rgba(236,72,153,0.3)",
    prompt: "Build a Lead Generation System with: drag-and-drop landing page builder, customizable lead capture forms, lead scoring based on engagement, email sequence automation, A/B testing for pages, conversion funnel analytics, CRM integration panel, and lead source attribution. Use React + Tailwind with a bold, conversion-focused design using pink/purple gradients.",
    category: "Marketing",
  },
  {
    id: "portfolio-website",
    name: "Portfolio Website",
    description: "Creative portfolio with project showcase, about section, blog, and contact form",
    icon: Briefcase,
    color: "#6366F1",
    glow: "rgba(99,102,241,0.3)",
    prompt: "Build a creative Portfolio Website with: animated hero section with name and tagline, project gallery with filtering by category, individual project detail pages with images and descriptions, about/bio section with skills and experience timeline, blog section for articles, contact form with social links, and smooth scroll animations. Use React + Tailwind with a minimal dark theme and indigo accents.",
    category: "Personal",
  },
  {
    id: "ecommerce-store",
    name: "E-commerce Store",
    description: "Product catalog, shopping cart, checkout flow, order management, and inventory",
    icon: ShoppingCart,
    color: "#F97316",
    glow: "rgba(249,115,22,0.3)",
    prompt: "Build an E-commerce Store with: product catalog with categories and search, product detail pages with image gallery and reviews, shopping cart with quantity management, checkout flow with shipping and payment, order history and tracking, wishlist functionality, and admin panel for inventory management. Use React + Tailwind with a clean, modern design using orange/white color scheme.",
    category: "Commerce",
  },
  {
    id: "landing-page",
    name: "Landing Page",
    description: "High-converting landing page with hero, features, testimonials, pricing, and CTA",
    icon: Rocket,
    color: "#14B8A6",
    glow: "rgba(20,184,166,0.3)",
    prompt: "Build a high-converting Landing Page with: animated hero section with headline, subheadline, and CTA button, feature grid with icons and descriptions, social proof section with testimonials and logos, pricing table with 3 tiers, FAQ accordion, newsletter signup, and footer with links. Use React + Tailwind with a modern gradient design using teal/cyan colors and smooth scroll animations.",
    category: "Marketing",
  },
  {
    id: "blog-content",
    name: "Blog / Content Site",
    description: "Content management with articles, categories, author profiles, and SEO optimization",
    icon: FileText,
    color: "#64748B",
    glow: "rgba(100,116,139,0.3)",
    prompt: "Build a Blog/Content Site with: article listing with featured posts and pagination, individual article pages with rich text rendering, category and tag filtering, author profile pages, search functionality, reading time estimates, table of contents for long articles, related posts suggestions, and newsletter subscription. Use React + Tailwind with a clean, readable design using slate/white colors and excellent typography.",
    category: "Content",
  },
];

export default function Templates() {
  const [, setLocation] = useLocation();
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [loadingTemplate, setLoadingTemplate] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const createProject = trpc.projects.create.useMutation({
    onSuccess: (result) => {
      toast.success("Project created from template! Redirecting...");
      utils.projects.list.invalidate();
      setLoadingTemplate(null);
      setLocation("/projects");
    },
    onError: (error) => {
      toast.error("Failed: " + error.message);
      setLoadingTemplate(null);
    },
  });

  const categories = ["All", ...Array.from(new Set(TEMPLATES.map((t) => t.category)))];

  const filtered = selectedCategory === "All"
    ? TEMPLATES
    : TEMPLATES.filter((t) => t.category === selectedCategory);

  const handleUseTemplate = (template: Template) => {
    setLoadingTemplate(template.id);
    createProject.mutate({
      name: template.name,
      description: template.prompt,
      projectType: "website",
    });
  };

  return (
    <div className="h-screen flex flex-col surface-base">
      <TopNav />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">
          {/* Header */}
          <motion.div
            className="mb-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: duration.normal, ease: ease.out }}
          >
            <div className="flex items-center gap-3 mb-2">
              <Sparkles size={20} className="text-primary" />
              <h1 className="text-xl font-display text-foreground">Templates Gallery</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Start with a pre-configured template. Captain Q will generate the full project code.
            </p>
          </motion.div>

          {/* Category Filter */}
          <div className="flex gap-2 mb-6 flex-wrap">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-medium tracking-wider uppercase transition-all ${
                  selectedCategory === cat
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Templates Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((template, i) => {
              const Icon = template.icon;
              const isLoading = loadingTemplate === template.id;
              return (
                <motion.div
                  key={template.id}
                  className="group relative surface-elevated border border-border rounded-xl p-5 hover:border-primary/30 transition-all overflow-hidden"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: duration.normal, ease: ease.out, delay: i * 0.05 }}
                  whileHover={{ y: -2 }}
                >
                  {/* Glow effect on hover */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                    style={{
                      background: `radial-gradient(circle at 50% 0%, ${template.glow}, transparent 70%)`,
                    }}
                  />

                  <div className="relative z-10">
                    {/* Icon */}
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
                      style={{ backgroundColor: template.color + "15", border: `1px solid ${template.color}30` }}
                    >
                      <Icon size={18} style={{ color: template.color }} />
                    </div>

                    {/* Content */}
                    <h3 className="text-sm font-display text-foreground mb-1">{template.name}</h3>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mb-4">{template.description}</p>

                    {/* Category tag */}
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">{template.category}</span>
                      <motion.button
                        onClick={() => handleUseTemplate(template)}
                        disabled={isLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all disabled:opacity-50"
                        style={{
                          backgroundColor: template.color + "15",
                          color: template.color,
                          border: `1px solid ${template.color}30`,
                        }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                      >
                        {isLoading ? (
                          <Loader2 size={10} className="animate-spin" />
                        ) : (
                          <>
                            Use Template
                            <ArrowRight size={10} />
                          </>
                        )}
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
