# Technical Assessment  

Complete the assessment in 3 days or otherwise stipulated. Do read the following details carefully and thoroughly for the requirements. If you have any queries on the assessment you may ask your interviewer for the contact. If you need time extension do request from your interviewer.

## Problem Statement

Create a React/Svelte frontend in Typescript and NodeJS web backend in Typescript/Javascript with the following functionalities.  

1. Upload a CSV file with appropriate feedback to the user on the upload progress. Data needs to be stored in a database.

2. List the data uploaded with pagination.  

3. Search data from the uploaded file. The web application should be responsive while listing of data and searching of data.  

4. Proper handling and checks for the data uploaded.

5. Real-time collaboration. The application must support two browser sessions simultaneously editing/searching the same dataset. When one user uploads a new CSV that overlaps with existing records (matching by a unique identifier in the data), the application must:
   - Detect duplicate/conflicting records
   - Display a real-time diff UI (without page refresh) showing what changed between the old and new data
   - [Optional] User can be allowed to choose to which version of the data to keep. Tha updates should also be reflected in real-time(within 3 seconds).

## Submission Requirement

In your submission, must include the following:  

1. Use this [csv file](data.csv) as the sample  

2. Include unit tests with complete test cases including edge cases.  

3. Provide a git repository for us to assess your submission.  

4. Provide a docker compose file to run the necessary components for your application.

5. Provide a readme in the git repository on how to setup and run the project.  

# Other notes

- You will be expected to run and demo your application running the docker compose file during the interview.
- During the demo, two browser tabs/windows should be opened and you will be required to perform the conflicting uploads simultaneously. You must explain every design decision in their conflict resolution strategy.

## Application setup and implementation

The original assessment above is preserved. This implementation uses React/TypeScript, Node.js/TypeScript and PostgreSQL.

### Run with Docker Compose

Start Docker Desktop with its Linux engine and Docker Compose v2. Run these commands from the repository root, with ports 3000 and 5433 available:

```powershell
docker compose up --build -d
docker compose ps
Invoke-RestMethod http://localhost:3000/api/health
```

When the health endpoint returns `ok`, open [http://localhost:3000](http://localhost:3000). If startup is still in progress, repeat the health request. Choose **Upload CSV** and select the supplied [data.csv](data.csv). Docker builds the frontend and runs the app and database; no host Node.js installation or `.env` file is required. Initial image/dependency downloads need internet access.

For collaboration, open a second browser window, preferably private/incognito, at the same address. Conflicting files open a comparison and remain entirely staged until **Apply upload**. **Reject upload** or dismissing that review leaves accepted data untouched. Committed changes appear in the other session within three seconds in the supported local demo.

```powershell
docker compose logs --tail 100 app db
docker compose down
```

Stopping with `down` retains the PostgreSQL named volume. `docker compose down -v` deletes that project's stored data; use it only for an intentional reset. Unsaved browser drafts do not survive reload.

### Tests and project guide

Run the parser tests in the built image:

```powershell
docker compose run --rm app npm test
```

The latest verified suites contain 4 parser tests, 27 API/PostgreSQL/WebSocket tests and 37 Chromium browser tests. API/browser suites require a dedicated database ending in `_test` and reset its schema; follow the [complete test instructions](docs/setup.md#tests) rather than using the application database.

- [Setup, development, configuration, API and troubleshooting](docs/setup.md)
- [Two-session demo and fixture outcomes](docs/demo/README.md)
- [Architecture and module responsibilities](docs/design.md)
- [Current specification](docs/spec.md) and [domain glossary](GLOSSARY.md)
- [Latest verification evidence](docs/verification.md) and [submission review/limitations](docs/submission-review.md)

The sole upload endpoint is `/api/imports`. `/api/uploads` is retired; existing stored conflicts remain recoverable. The frontend import workflow owns transfer, retries and review state; the backend validates data and enforces transactional and revision checks.
