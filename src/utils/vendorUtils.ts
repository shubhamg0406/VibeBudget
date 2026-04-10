import { 
  ShoppingBag, 
  Coffee, 
  Utensils, 
  Car, 
  Zap, 
  Heart, 
  Gamepad2, 
  Home, 
  Briefcase, 
  Smartphone, 
  Globe, 
  CreditCard, 
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  LucideIcon
} from "lucide-react";

/**
 * Maps common vendor names to their likely domains for Clearbit Logo API
 */
const VENDOR_DOMAINS: Record<string, string> = {
  "shell": "shell.com",
  "shoppers drug mart": "shoppersdrugmart.ca",
  "starbucks": "starbucks.com",
  "amazon": "amazon.com",
  "netflix": "netflix.com",
  "spotify": "spotify.com",
  "uber": "uber.com",
  "lyft": "lyft.com",
  "walmart": "walmart.com",
  "target": "target.com",
  "apple": "apple.com",
  "google": "google.com",
  "facebook": "facebook.com",
  "meta": "meta.com",
  "instagram": "instagram.com",
  "upstox": "upstox.com",
  "upstoxx": "upstox.com",
  "zerodha": "zerodha.com",
  "mcdonald's": "mcdonalds.com",
  "mcdonalds": "mcdonalds.com",
  "tim hortons": "timhortons.ca",
  "costco": "costco.com",
  "loblaws": "loblaws.ca",
  "sobeys": "sobeys.com",
  "metro": "metro.ca",
  "td bank": "td.com",
  "rbc": "rbcroyalbank.com",
  "scotiabank": "scotiabank.com",
  "bmo": "bmo.com",
  "cibc": "cibc.com",
  "rogers": "rogers.com",
  "bell": "bell.ca",
  "telus": "telus.com",
  "instacart": "instacart.com",
  "door dash": "doordash.com",
  "doordash": "doordash.com",
  "skip the dishes": "skipthedishes.com",
  "skipthedishes": "skipthedishes.com",
  "nike": "nike.com",
  "adidas": "adidas.com",
  "zara": "zara.com",
  "h&m": "hm.com",
  "ikea": "ikea.com",
  "home depot": "homedepot.com",
  "lowe's": "lowes.com",
  "best buy": "bestbuy.com",
  "canadian tire": "canadiantire.ca",
  "shoppers": "shoppersdrugmart.ca",
  "lcbo": "lcbo.com",
  "beer store": "thebeerstore.ca",
  "shell gas": "shell.com",
  "esso": "esso.ca",
  "petro canada": "petro-canada.ca",
  "swiggy": "swiggy.com",
  "zomato": "zomato.com",
  "paytm": "paytm.com",
  "phonepe": "phonepe.com",
  "flipkart": "flipkart.com",
  "amazon india": "amazon.in",
  "reliance": "relianceindustries.com",
  "tata": "tata.com",
  "airtel": "airtel.in",
  "jio": "jio.com",
  "vi": "myvi.in",
  "vodafone": "vodafone.com",
  "idea": "ideacellular.com",
  "lic": "licindia.in",
  "hdfc": "hdfcbank.com",
  "icici": "icicibank.com",
  "sbi": "sbi.co.in",
  "axis bank": "axisbank.com",
  "kotak": "kotak.com",
  "indusind": "indusind.com",
  "yes bank": "yesbank.in",
  "ola": "olacabs.com",
  "uber india": "uber.com",
  "rapido": "rapido.bike",
  "bigbasket": "bigbasket.com",
  "blinkit": "blinkit.com",
  "zepto": "zepto.com",
  "dunzo": "dunzo.com",
  "nykaa": "nykaa.com",
  "myntra": "myntra.com",
  "ajio": "ajio.com",
  "meesho": "meesho.com",
  "bookmyshow": "bookmyshow.com",
  "pvr": "pvrcinemas.com",
  "inox": "inoxmovies.com",
  "makemytrip": "makemytrip.com",
  "goibibo": "goibibo.com",
  "cleartrip": "cleartrip.com",
  "easemytrip": "easemytrip.com",
  "irctc": "irctc.co.in",
  "indigo": "goindigo.in",
  "air india": "airindia.in",
  "spicejet": "spicejet.com",
  "vistara": "airvistara.com",
  "urban company": "urbancompany.com",
  "cult.fit": "cult.fit",
  "pharmeasy": "pharmeasy.in",
  "1mg": "1mg.com",
  "netmeds": "netmeds.com",
  "apollo pharmacy": "apollopharmacy.in",
  "medplus": "medplusmart.com",
  "carfax": "carfax.com",
  "sedemac": "sedemac.com",
};

/**
 * Maps categories to Lucide icons
 */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "food": Utensils,
  "dining": Utensils,
  "restaurant": Utensils,
  "eat": Utensils,
  "groceries": ShoppingBag,
  "shopping": ShoppingBag,
  "store": ShoppingBag,
  "market": ShoppingBag,
  "transport": Car,
  "car": Car,
  "fuel": Car,
  "gas": Car,
  "travel": Globe,
  "flight": Globe,
  "hotel": Globe,
  "utilities": Zap,
  "electricity": Zap,
  "hydro": Zap,
  "health": Heart,
  "medical": Heart,
  "pharmacy": Heart,
  "entertainment": Gamepad2,
  "game": Gamepad2,
  "movie": Gamepad2,
  "housing": Home,
  "rent": Home,
  "parents": Home,
  "family": Home,
  "home": Home,
  "dhaba": Utensils,
  "tiffin": Utensils,
  "misc": CreditCard,
  "miscellaneous": CreditCard,
  "work": Briefcase,
  "office": Briefcase,
  "salary": DollarSign,
  "income": ArrowUpRight,
  "subscription": Smartphone,
  "phone": Smartphone,
  "internet": Globe,
  "finance": CreditCard,
  "bank": CreditCard,
  "coffee": Coffee,
  "cafe": Coffee,
};

/**
 * Normalizes a vendor name for matching
 */
const normalizeName = (name: string) => name.toLowerCase().trim();

/**
 * Gets the logo URL for a vendor name if available
 */
export const getVendorLogo = (name: string): string | null => {
  const normalized = normalizeName(name);
  
  // Direct match
  if (VENDOR_DOMAINS[normalized]) {
    return `https://logo.clearbit.com/${VENDOR_DOMAINS[normalized]}`;
  }

  // Partial match
  for (const [key, domain] of Object.entries(VENDOR_DOMAINS)) {
    if (normalized.includes(key)) {
      return `https://logo.clearbit.com/${domain}`;
    }
  }

  return null;
};

/**
 * Gets the best icon for a category or transaction type
 */
export const getCategoryIcon = (category: string, type: "income" | "expense"): LucideIcon => {
  const normalized = normalizeName(category);
  
  if (CATEGORY_ICONS[normalized]) {
    return CATEGORY_ICONS[normalized];
  }

  // Try partial matches for categories
  for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
    if (normalized.includes(key)) {
      return icon;
    }
  }

  return type === "income" ? ArrowUpRight : ArrowDownRight;
};
