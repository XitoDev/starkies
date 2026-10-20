# Starkies

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.3.

## Development server

The public catalog uses Vercel serverless functions for order creation, customer lookup, and order PDFs. Angular's development server alone does not serve the `/api/*` endpoints, so start both services together:

1. Link this repository to the correct Vercel project if it is not linked already.
2. Pull the Development environment variables locally (the service account configuration is required to persist orders):

   ```bash
   npx vercel env pull .env.local --environment=development
   ```

   Keep `.env.local` private; never commit it or share its contents.
3. Start the local catalog and API together:

   ```bash
   npm start
   ```

Open `http://localhost:4200/`. The catalog runs through Angular, while `/api/*` requests are proxied to Vercel Dev on port 3000. If the required Firebase environment variables are missing, order creation will return a configuration error rather than saving an order.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## Public catalog and order PDFs

The storefront loads its products and delivery fees from the business data through the public catalog API. That endpoint projects only visible, non-archived recipes into `businesses/starkies/collections/catalog/records`; the public app no longer keeps a separate hardcoded product list. Order validation reads the same live recipes and delivery settings.

The Firestore rules intentionally make only `businesses/starkies/collections/catalog/records/*` publicly readable. All other business data and writes remain restricted to approved administrators (server-side Firebase Admin SDK writes are governed by service-account IAM, not client Firestore rules). After reviewing this change, deploy the updated rules with the Firebase CLI for the `starkies` project.

Order creation now prepares its signed PDF access token before persisting the order, so missing document-signing configuration cannot produce a successful-looking order that has no PDF link. The PDF URL is served by `GET /api/order-document?token=...` and expires after seven days. Keep `FIREBASE_SERVICE_ACCOUNT_JSON` configured in the Vercel environment for the catalog deployment.
