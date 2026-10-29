# Route map

Next.js 16 App Router; root shell is `app/layout.tsx`.

| Route | Entry | Surface |
| --- | --- | --- |
| / | app/page.tsx | LandingPage and public header/footer |
| /models | app/models/page.tsx | Searchable catalog and public shell |
| /docs | app/docs/page.tsx | API reference and public shell |
| /plans | app/plans/page.tsx | Plan catalog and public shell |
| /login | app/login/page.tsx | AuthScreen login |
| /signup | app/signup/page.tsx | AuthScreen signup |
| /account | app/account/page.tsx | AccountHeader, keys, wallet, history, subscription |
| /dashboard | app/dashboard/page.tsx | Operator console, provider/key/tester/usage panels |
| /admin/login | app/admin/login/page.tsx | Admin login screen |
| /admin | app/admin/(panel)/page.tsx | Authenticated overview |
| /admin/customers | app/admin/(panel)/customers/page.tsx | Customer table and credit |
| /admin/catalog | app/admin/(panel)/catalog/page.tsx | Model management |
| /admin/groups | app/admin/(panel)/groups/page.tsx | Group management |
| /admin/plans | app/admin/(panel)/plans/page.tsx | Plan authoring |
| /admin/subscriptions | app/admin/(panel)/subscriptions/page.tsx | Subscription lifecycle |
| /admin/providers | app/admin/(panel)/providers/page.tsx | Provider registry |
| /admin/pricing | app/admin/(panel)/pricing/page.tsx | Cost and sell pricing |
| /admin/analytics | app/admin/(panel)/analytics/page.tsx | Revenue and usage |

All admin panel entries share `app/admin/(panel)/layout.tsx`. API route handlers
are behavior dependencies, not visual design context.
