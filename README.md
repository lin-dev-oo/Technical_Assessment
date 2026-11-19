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

## Running the app

Built with React, TypeScript, Express and PostgreSQL. Docker Compose runs both the app and database.

With Docker running, from the project root:

```sh
docker compose up --build -d
```

Open [localhost:3000](http://localhost:3000) and upload [data.csv](data.csv). Ports 3000 and 5433 need to be free. No .env file is needed for the Docker setup.

After rebuilding the frontend, reload any open app sessions to load the new version. Save your drafts first.

To try collaboration, open the app in two browser windows. Upload the conflicting samples from [docs/demo](docs/demo/README.md). A conflicting file waits for review; Apply upload saves the whole file, while closing the review rejects it.

Useful commands:

```sh
docker compose logs -f app
docker compose down
```

The database is kept between runs. Use `docker compose down -v` to reset it.

### Tests

Parser tests can run in the app container:

```sh
docker compose run --rm app npm test
```

API and browser tests use a separate PostgreSQL database ending in `_test`. They clear that database between tests. Commands for both suites, plus local development setup, are in [docs/setup.md](docs/setup.md).

### Further reading

- [Two-session demo](docs/demo/README.md)
- [Design and conflict handling](docs/design.md)
- [Test results and known limitations](docs/verification.md)
