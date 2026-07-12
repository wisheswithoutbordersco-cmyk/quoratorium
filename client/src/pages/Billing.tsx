import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Zap, Crown, Rocket, Plus, CreditCard, ExternalLink, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function Billing() {
  const { user } = useAuth();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const { data: balance, isLoading: balanceLoading } = trpc.billing.getBalance.useQuery();
  const { data: subscription } = trpc.billing.getSubscription.useQuery();
  const { data: pricing } = trpc.billing.getPricing.useQuery();

  const createCheckout = trpc.billing.createCheckout.useMutation({
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err) => {
      toast.error(err.message);
      setCheckoutLoading(null);
    },
  });

  const createTopUpCheckout = trpc.billing.createTopUpCheckout.useMutation({
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err) => {
      toast.error(err.message);
      setCheckoutLoading(null);
    },
  });

  const createPortal = trpc.billing.createPortalSession.useMutation({
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleSubscribe = (plan: "starter" | "pro") => {
    setCheckoutLoading(plan);
    createCheckout.mutate({
      plan,
      successUrl: `${window.location.origin}/billing?success=true`,
      cancelUrl: `${window.location.origin}/billing?canceled=true`,
    });
  };

  const handleTopUp = (topUpId: "small" | "medium" | "large") => {
    setCheckoutLoading(topUpId);
    createTopUpCheckout.mutate({
      topUpId,
      successUrl: `${window.location.origin}/billing?topup=success`,
      cancelUrl: `${window.location.origin}/billing?topup=canceled`,
    });
  };

  const handleManageBilling = () => {
    createPortal.mutate({
      returnUrl: `${window.location.origin}/billing`,
    });
  };

  const currentPlan = balance?.plan || "free";
  const dailyUsagePercent = balance ? (balance.dailyCreditsUsed / balance.dailyCreditsLimit) * 100 : 0;

  return (
    <div className="container max-w-6xl py-8 space-y-8">
      {/* Back Button */}
      <div className="flex items-center gap-2 mb-4">
        <Link href="/workspace">
          <Button
            variant="ghost"
            size="sm"
            className="text-zinc-400 hover:text-white hover:bg-zinc-800/50"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Workspace
          </Button>
        </Link>
      </div>
      {/* Credit Balance Card */}
      <Card className="border-emerald-500/20 bg-black/40 backdrop-blur">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl text-emerald-400 flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Credit Balance
              </CardTitle>
              <CardDescription className="text-zinc-400">
                Credits reset daily at midnight UTC
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className={`text-sm px-3 py-1 ${
                currentPlan === "pro"
                  ? "border-amber-500/50 text-amber-400"
                  : currentPlan === "starter"
                  ? "border-emerald-500/50 text-emerald-400"
                  : "border-zinc-500/50 text-zinc-400"
              }`}
            >
              {currentPlan === "pro" ? <Crown className="w-3 h-3 mr-1" /> : null}
              {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} Plan
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {balanceLoading ? (
            <div className="animate-pulse h-20 bg-zinc-800 rounded" />
          ) : balance ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Daily Credits</p>
                  <p className="text-2xl font-bold text-white mt-1">
                    {balance.dailyCreditsRemaining}
                    <span className="text-sm text-zinc-500 font-normal"> / {balance.dailyCreditsLimit}</span>
                  </p>
                  <Progress value={dailyUsagePercent} className="mt-2 h-1.5" />
                </div>
                <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Bonus Credits</p>
                  <p className="text-2xl font-bold text-emerald-400 mt-1">{balance.bonusCredits}</p>
                  <p className="text-xs text-zinc-500 mt-2">Never expire</p>
                </div>
                <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Total Available</p>
                  <p className="text-2xl font-bold text-white mt-1">{balance.totalAvailable}</p>
                  <p className="text-xs text-zinc-500 mt-2">
                    Resets: {new Date(balance.resetAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
        {subscription && subscription.stripe_subscription_id && (
          <CardFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={handleManageBilling}
              className="border-zinc-700 text-zinc-300 hover:text-white"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Manage Billing
              <ExternalLink className="w-3 h-3 ml-2" />
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* Subscription Plans */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Subscription Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Free Plan */}
          <Card className={`border-zinc-700/50 bg-black/40 backdrop-blur ${currentPlan === "free" ? "ring-1 ring-zinc-500" : ""}`}>
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-zinc-400" />
                Free
              </CardTitle>
              <CardDescription className="text-zinc-400">Get started with AI</CardDescription>
              <div className="pt-2">
                <span className="text-3xl font-bold text-white">$0</span>
                <span className="text-zinc-500">/month</span>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-zinc-300">
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span> 25 credits/day
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span> Basic AI models
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span> 3 projects
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              {currentPlan === "free" ? (
                <Badge variant="secondary" className="w-full justify-center py-2 bg-zinc-800 text-zinc-300">
                  Current Plan
                </Badge>
              ) : (
                <Button variant="outline" className="w-full border-zinc-700" disabled>
                  Downgrade via Portal
                </Button>
              )}
            </CardFooter>
          </Card>

          {/* Starter Plan */}
          <Card className={`border-emerald-500/30 bg-black/40 backdrop-blur ${currentPlan === "starter" ? "ring-1 ring-emerald-500" : ""}`}>
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Rocket className="w-5 h-5 text-emerald-400" />
                Starter
              </CardTitle>
              <CardDescription className="text-zinc-400">For regular builders</CardDescription>
              <div className="pt-2">
                <span className="text-3xl font-bold text-white">$29</span>
                <span className="text-zinc-500">/month</span>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-zinc-300">
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span> 100 credits/day
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span> All AI models
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span> Unlimited projects
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span> Priority support
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              {currentPlan === "starter" ? (
                <Badge variant="secondary" className="w-full justify-center py-2 bg-emerald-900/30 text-emerald-400 border border-emerald-500/30">
                  Current Plan
                </Badge>
              ) : (
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => handleSubscribe("starter")}
                  disabled={checkoutLoading === "starter"}
                >
                  {checkoutLoading === "starter" ? "Loading..." : currentPlan === "pro" ? "Downgrade" : "Upgrade to Starter"}
                </Button>
              )}
            </CardFooter>
          </Card>

          {/* Pro Plan */}
          <Card className={`border-amber-500/30 bg-black/40 backdrop-blur relative ${currentPlan === "pro" ? "ring-1 ring-amber-500" : ""}`}>
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge className="bg-amber-500 text-black font-semibold">Most Popular</Badge>
            </div>
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-400" />
                Pro
              </CardTitle>
              <CardDescription className="text-zinc-400">For power users</CardDescription>
              <div className="pt-2">
                <span className="text-3xl font-bold text-white">$99</span>
                <span className="text-zinc-500">/month</span>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-zinc-300">
                <li className="flex items-center gap-2">
                  <span className="text-amber-400">✓</span> 500 credits/day
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-amber-400">✓</span> Priority AI models
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-amber-400">✓</span> Unlimited projects
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-amber-400">✓</span> Priority support
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-amber-400">✓</span> Custom deployments
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              {currentPlan === "pro" ? (
                <Badge variant="secondary" className="w-full justify-center py-2 bg-amber-900/30 text-amber-400 border border-amber-500/30">
                  Current Plan
                </Badge>
              ) : (
                <Button
                  className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                  onClick={() => handleSubscribe("pro")}
                  disabled={checkoutLoading === "pro"}
                >
                  {checkoutLoading === "pro" ? "Loading..." : "Upgrade to Pro"}
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>
      </div>

      {/* Credit Top-Ups */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-2">Credit Top-Ups</h2>
        <p className="text-sm text-zinc-400 mb-4">Need more credits today? Buy a one-time top-up. Bonus credits never expire.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-zinc-700/50 bg-black/40 backdrop-blur hover:border-emerald-500/30 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                200 Credits
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-white">$9</span>
              <span className="text-zinc-500 text-sm ml-1">one-time</span>
            </CardContent>
            <CardFooter>
              <Button
                variant="outline"
                className="w-full border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                onClick={() => handleTopUp("small")}
                disabled={checkoutLoading === "small"}
              >
                {checkoutLoading === "small" ? "Loading..." : "Buy 200 Credits"}
              </Button>
            </CardFooter>
          </Card>

          <Card className="border-zinc-700/50 bg-black/40 backdrop-blur hover:border-emerald-500/30 transition-colors">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg text-white flex items-center gap-2">
                  <Plus className="w-4 h-4 text-emerald-400" />
                  500 Credits
                </CardTitle>
                <Badge variant="outline" className="text-xs border-emerald-500/50 text-emerald-400">Best Value</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-white">$19</span>
              <span className="text-zinc-500 text-sm ml-1">one-time</span>
            </CardContent>
            <CardFooter>
              <Button
                variant="outline"
                className="w-full border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                onClick={() => handleTopUp("medium")}
                disabled={checkoutLoading === "medium"}
              >
                {checkoutLoading === "medium" ? "Loading..." : "Buy 500 Credits"}
              </Button>
            </CardFooter>
          </Card>

          <Card className="border-zinc-700/50 bg-black/40 backdrop-blur hover:border-emerald-500/30 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                1,500 Credits
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-white">$49</span>
              <span className="text-zinc-500 text-sm ml-1">one-time</span>
            </CardContent>
            <CardFooter>
              <Button
                variant="outline"
                className="w-full border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                onClick={() => handleTopUp("large")}
                disabled={checkoutLoading === "large"}
              >
                {checkoutLoading === "large" ? "Loading..." : "Buy 1,500 Credits"}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
