# SafeHaven
Providing support to someone feeling unsafe

SafeHaven

SafeHaven is a web-based safety application designed to help users who feel unsafe quickly contact trusted people and share their location. The application includes trusted contacts, emergency alerts, quick exit, accessibility settings, and location sharing.

How to Run
1. Install Requirements
Make sure you have:
Node.js
PostgreSQL
pgAdmin
VS Code
Live Server extension for VS Code

2. Set Up the Database
Create a PostgreSQL database called gbv_safety and run the schema.sql file using pgAdmin.

3. Configure the Backend
Open the backend folder and create a .env file with your database connection, server port, allowed frontend origin, and JWT secret.
Make sure the PostgreSQL port matches your local installation.

4. Install Dependencies
Open a terminal in the backend folder and run:
npm install

5. Start the Backend
From the backend folder, run:
node server.js
The backend should run on:
http://localhost:3000

6. Start the Frontend
Open frontend/index.html in VS Code and select Open with Live Server.
The frontend will normally open at:
http://127.0.0.1:5500
Make sure this address matches the ALLOWED_ORIGIN value in your backend .env file.

7. Test the Application
Register an account, add a trusted contact, confirm the contact, and test the I Need Help Now and Send My Location features.
Note: During development, SMS may be running in stub/test mode. Do not rely on the local development version as a real emergency service.
Register an account, add a trusted contact, confirm the contact, and test the I Need Help Now and Send My Location features.

Note: During development, SMS may be running in stub/test mode. Do not rely on the local development version as a real emergency service.
