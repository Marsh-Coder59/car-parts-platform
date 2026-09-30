# Partora — Frontend

**Automotive Parts Marketplace**

React + Vite + TypeScript + Tailwind CSS frontend for the Partora e-commerce platform.

## Prerequisites

- Node.js 18+
- npm 9+
- The Partora FastAPI backend running (see backend README)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and set VITE_API_BASE_URL to your backend URL

# 3. Start development server
npm run dev
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_BASE_URL` | Yes | `http://localhost:8000` | URL of the FastAPI backend |

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start dev server on port 3000 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build |

## Logo

To replace the logo, drop your image at:

```
src/assets/logo.png
```

Then open `src/components/shared/Logo.tsx` and uncomment the import line:

```ts
import logoImage from '../../assets/logo.png';
```

And set:

```ts
const logoImage: string | null = logoImage; // imported above
```

All instances across the app update automatically.

## Architecture

```
src/
  assets/          # Logo and static assets
  components/
    layout/        # PublicNav, AdminSidebar, layouts
    shared/        # Logo, ProductCard
    ui/            # Button, Input, Modal, Badge, Skeleton, etc.
  context/         # AuthContext, CartContext, LoadingContext
  pages/
    public/        # Home, Products, Login, Register, etc.
    customer/      # Cart, Checkout, Orders, Account, etc.
    admin/         # Dashboard, Products, Orders, Payments, etc.
  routes/          # ProtectedRoute guards
  services/        # API service layer (axios)
  types/           # TypeScript types from backend contract
  utils/           # formatCurrency, formatDate, etc.
```

## Payment Method

**Bank Transfer only.** No M-Pesa, no PayPal, no card gateway.
The payment flow is:
1. Customer places order → backend calculates totals
2. Frontend displays bank details from backend settings
3. Customer transfers externally
4. Customer submits reference number
5. Staff/Admin verifies in admin panel
6. Backend updates order status

## Role-Based Access

- **CUSTOMER** — shop, cart, orders, payments, wishlist, profile
- **STAFF** — admin panel (no staff/settings management)
- **ADMIN** — full admin panel including staff and settings
