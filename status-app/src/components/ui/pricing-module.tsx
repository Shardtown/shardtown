import * as React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PlanFeature {
  label: string;
  included: boolean;
}

export interface PricingPlan {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  priceMonthly: number;
  priceYearly: number;
  /** Affichage libre sous "Overview" — "1 serveur Discord", etc. */
  users: string;
  features: PlanFeature[];
  recommended?: boolean;
  /** Lien ou handler du CTA principal de la card. */
  href?: string;
  onSelect?: () => void;
  /** Override le label monthly/yearly côté affichage du prix
   *  ("4,97 €" → utilise priceMonthly avec ce suffixe). */
  pricePrefix?: string;
  /** Suffixe affiché à la place de /month ou /year. */
  priceSuffix?: { monthly: string; yearly: string };
}

export interface PricingModuleProps {
  title?: string;
  subtitle?: string;
  annualBillingLabel?: string;
  buttonLabel?: string;
  plans: PricingPlan[];
  defaultAnnual?: boolean;
  className?: string;
  /** Cache le switch monthly/yearly quand il n'y en a pas besoin
   *  (ex: les plans ont un prix fixe, ou un plan "à vie"). */
  showToggle?: boolean;
  /** Devise affichée devant le prix (€ par défaut, "$" possible). */
  currency?: string;
  /** Position de la devise — "prefix" (€ 49) ou "suffix" (49 €). */
  currencyPosition?: "prefix" | "suffix";
}

export function PricingModule({
  title = "Pricing Plans",
  subtitle = "Choose a plan that fits your needs.",
  annualBillingLabel = "Annual billing",
  buttonLabel = "Get started",
  plans,
  defaultAnnual = false,
  className,
  showToggle = true,
  currency = "€",
  currencyPosition = "suffix",
}: PricingModuleProps) {
  const [isAnnual, setIsAnnual] = React.useState(defaultAnnual);

  const formatPrice = (n: number) => {
    const fr = n.toLocaleString("fr-FR", {
      minimumFractionDigits: n % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    });
    return currencyPosition === "prefix" ? `${currency}${fr}` : `${fr} ${currency}`;
  };

  return (
    <section
      className={cn(
        "w-full text-foreground py-20 px-4 md:px-8",
        className,
      )}
    >
      <div className="max-w-6xl mx-auto text-center">
        <h2 className="text-4xl font-bold tracking-tight mb-2">{title}</h2>
        <p className="text-white/55 mb-8">{subtitle}</p>

        {/* Toggle */}
        {showToggle && (
          <div className="flex items-center justify-center gap-2 mb-10">
            <Switch
              id="billing-toggle"
              checked={isAnnual}
              onCheckedChange={checked => setIsAnnual(checked)}
            />
            <label
              htmlFor="billing-toggle"
              className="text-sm text-white/55 cursor-pointer"
            >
              {annualBillingLabel}
            </label>
          </div>
        )}

        {/* Pricing Cards — grid adapté au nombre de plans (jusqu'à 4). */}
        <div
          className={cn(
            "grid grid-cols-1 sm:grid-cols-2 gap-6",
            plans.length >= 3 && "lg:grid-cols-3",
            plans.length >= 4 && "lg:grid-cols-4",
            plans.length === 2 && "max-w-4xl mx-auto",
          )}
        >
          {plans.map(plan => {
            const price = isAnnual ? plan.priceYearly : plan.priceMonthly;
            const fallbackSuffix = isAnnual ? "/ an" : "/ mois";
            const suffix = plan.priceSuffix
              ? (isAnnual ? plan.priceSuffix.yearly : plan.priceSuffix.monthly)
              : fallbackSuffix;
            return (
              <Card
                key={plan.id}
                className={cn(
                  "relative transition-all hover:shadow-md hover:border-white/15",
                  plan.recommended &&
                    "border-white/30 ring-1 ring-white/20 scale-[1.02]",
                )}
              >
                {plan.recommended && (
                  <div className="absolute -top-3 left-0 right-0 mx-auto w-fit bg-white text-black text-[11px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                    Recommandé
                  </div>
                )}

                <CardHeader className="text-center pt-8">
                  <div className="flex justify-center mb-4">{plan.icon}</div>
                  <CardTitle>{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>

                <CardContent className="text-center">
                  <div className="text-3xl font-bold mb-2 transition-all duration-300 font-mono-num">
                    {formatPrice(price)}
                  </div>
                  <p className="text-sm text-white/55 mb-6">{suffix}</p>

                  {plan.href ? (
                    <a
                      href={plan.href}
                      className="block"
                    >
                      <Button
                        variant={plan.recommended ? "default" : "outline"}
                        className="w-full mb-6"
                      >
                        {buttonLabel}
                      </Button>
                    </a>
                  ) : (
                    <Button
                      type="button"
                      onClick={plan.onSelect}
                      variant={plan.recommended ? "default" : "outline"}
                      className="w-full mb-6"
                    >
                      {buttonLabel}
                    </Button>
                  )}

                  <div className="text-left text-sm">
                    <h4 className="font-semibold mb-2">Pour qui</h4>
                    <p className="text-white/55 mb-4">✓ {plan.users}</p>

                    <h4 className="font-semibold mb-2">Inclus</h4>
                    <ul className="space-y-2">
                      {plan.features.map((f, i) => (
                        <li key={i} className="flex items-center gap-2">
                          {f.included ? (
                            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <X className="w-4 h-4 text-white/30 shrink-0" />
                          )}
                          <span
                            className={
                              f.included
                                ? "text-white/75"
                                : "text-white/35 line-through"
                            }
                          >
                            {f.label}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
