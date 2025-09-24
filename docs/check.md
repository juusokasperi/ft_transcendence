# Project Checklist

## Mandatory part — Minimal technical requirement

- [ ] You are free to develop the site, with or without a backend.
- [ ] If you choose to include a backend, it must be written in pure PHP without frameworks. However, this requirement can be overridden by the Framework module.
- [ ] If your backend or framework uses a database, you must follow the constraints of the Database module.
- [ ] The frontend should be developed using Typescript as base code. However, this requirement can be modified through the FrontEnd module.
- [ ] Your website must be a single-page application. The user should be able to use the Back and Forward buttons of the browser.
- [ ] Your website must be compatible with the latest stable up-to-date version of Mozilla Firefox . Of course, it can be compatible with other web browsers!
- [ ] The user should encounter no unhandled errors or warnings when browsing the website.
- [ ] You must use Docker to run your website. Everything must be launched with a single command line to run an autonomous container.

## Mandatory part — Game

- [ ] Users must be able to participate in a live Pong game against another player directly on the website. Both players will use the same keyboard. The Remote players module can enhance this functionality with remote players.
- [ ] A player must be able to play against another, and a tournament system should also be available. This tournament will consist of multiple players who can take turns playing against each other. You have flexibility in how you implement the tournament, but it must clearly display who is playing against whom and the order of the play.
- [ ] A registration system is required: at the start of a tournament, each player must input their alias. The aliases will be reset when a new tournament begins. However, this requirement can be modified using the Standard User Management module.
- [ ] There must be a matchmaking system: the tournament system should organize the matchmaking of the participants, and announce the next match.
- [ ] All players must adhere to the same rules, including having identical paddle speed. This requirement also applies when using AI; the AI must exhibit the same speed as a regular player.
- [ ] The game must adhere to the default frontend constraints (as outlined above), or you may choose to use the FrontEnd module, or override it with the Graphics module. While the visual aesthetics can vary, the game must still capture the essence of the original Pong (1972).

## Mandatory part — Security concerns

- [ ] Any password stored in your database, if applicable, must be hashed.
- [ ] Your website must be protected against SQL injections/XSS attacks.
- [ ] If you have a backend or any other features, it is mandatory to enable an HTTPS connection for all aspects (use wss instead of ws for example).
- [ ] You must implement validation mechanisms for forms and any user input, either on the base page if no backend is used, or on the server side if a backend is employed.
- [ ] Regardless of whether you choose to implement the JWT Security module with 2FA, it’s essential to prioritize the security of your website. For instance, if you choose to create an API, ensure your routes are protected. Even if you decide not to use JWT tokens, securing the site remains critical.

## Web — Major module: Use a framework to build the backend.

- [ ] In this major module, you are required to use a specific web framework for backend development: Fastify with Node.js .

## Web — Minor module: Use a framework or toolkit to build the front-end.

- [ ] Your frontend development must use the Tailwind CSS in addition of the Typescript, and nothing else.

## Web — Minor module: Use a database for the backend -and more.

- [ ] The designated database for all DB instances in your project is SQLite This choice ensure data consistency and compatibility across all project components and may be a prerequisite for other modules, such as the backend Framework module.

## User Management — Major module: Standard user management, authentication and users across tournaments.

- [ ] Users can securely subscribe to the website.
- [ ] Registered users can securely log in.
- [ ] Users can select a unique display name to participate in tournaments.
- [ ] Users can update their information.
- [ ] Users can upload an avatar, with a default option if none is provided.
- [ ] Users can add others as friends and view their online status.
- [ ] User profiles display stats, such as wins and losses.
- [ ] Each user has a Match History including 1v1 games, dates, and relevant details, accessible to logged-in users.

## User Management — Major module: Implement remote authentication.

- [ ] Integrate the authentication system, allowing users to securely sign in.
- [ ] Obtain the necessary credentials and permissions from the authority to enable secure login.
- [ ] Implement user-friendly login and authorization flows that adhere to best practices and security standards.
- [ ] Ensure the secure exchange of authentication tokens and user information between the web application and the authentication provider.

## Gameplay and user experience — Major module: Remote players

- [ ] It should be possible for two players to play remotely. Each player is located on a separated computer, accessing the same website and playing the same Pong game.
- [ ] Consider network issues, such as unexpected disconnections or lag. You must offer the best user experience possible.

## AI-Algo — Major module: Introduce an AI opponent.

- [ ] Develop an AI opponent that provides a challenging and engaging gameplay experience for users.
- [ ] The AI must replicate human behavior, which means that in your AI implementation, you must simulate keyboard input. The constraint here is that the AI can only refresh its view of the game once per second, requiring it to anticipate bounces and other actions.
- [ ] Implement AI logic and decision-making processes that enable the AI player to make intelligent and strategic moves.
- [ ] Explore alternative algorithms and techniques to create an effective AI player without relying on A\*.
- [ ] Ensure that the AI adapts to different gameplay scenarios and user interactions.

## AI-Algo — Minor module: User and Game Stats Dashboards.

- [ ] Create user-friendly dashboards that provide users with insights into their gaming statistics.
- [ ] Develop a separate dashboard for game sessions, showing detailed statistics, outcomes, and historical data for each match.
- [ ] Ensure that the dashboards offer an intuitive and informative user interface for tracking and analyzing data.
- [ ] Implement data visualization techniques, such as charts and graphs, to present statistics in a clear and visually appealing manner.
- [ ] Allow users to access and explore their own gaming history and performance metrics conveniently.
- [ ] Feel free to add any metrics you deem useful.

## Cybersecurity — Minor module: GDPR compliance options with user anonymization, local data management, and account deletion.

The goal of this minor module is to introduce GDPR compliance options that allow users to exercise their data privacy rights. Key features and objectives include:

- [ ] Implement GDPR-compliant features that enable users to request anonymization of their personal data, ensuring that their identity and sensitive information are protected.
- [ ] Provide tools for users to manage their local data, including the ability to view, edit, or delete their personal information stored within the system.
- [ ] Offer a streamlined process for users to request the permanent deletion of their accounts, including all associated data, ensuring compliance with data protection regulations.
- [ ] Maintain clear and transparent communication with users regarding their data privacy rights, with easily accessible options to exercise these rights.
      This minor module aims to enhance user privacy and data protection by offering GDPR compliance options that empower users to control their personal information and exercise their data privacy rights within the system.

## Cybersecurity — Major module: Implement Two-Factor Authentication (2FA) and JWT.

- [ ] Implement Two-Factor Authentication (2FA) as an additional layer of security for user accounts, requiring users to provide a secondary verification method, such as a one-time code, in addition to their password.
- [ ] Utilize JSON Web Tokens (JWT) as a secure method for authentication and authorization, ensuring that user sessions and access to resources are managed securely.
- [ ] Provide a user-friendly setup process for enabling 2FA, with options for SMS codes, authenticator apps, or email-based verification.
- [ ] Ensure that JWT tokens are issued and validated securely to prevent unauthorized access to user accounts and sensitive data.

## Devops — Major module: Infrastructure Setup with ELK (Elasticsearch, Logstash, Kibana) for Log Management.

- [ ] Deploy Elasticsearch to efficiently store and index log data, ensuring it is easily searchable and accessible.
- [ ] Configure Logstash to collect, process, and transform log data from various sources, sending it to Elasticsearch.
- [ ] Set up Kibana for visualizing log data, creating dashboards, and generating insights from log events.
- [ ] Define data retention and archiving policies to manage log data storage effectively.
- [ ] Implement security measures to protect log data and access to the ELK stack components.

## Devops — Minor module: Monitoring system.

- [ ] Deploy Prometheus as the monitoring and alerting toolkit to collect metrics and monitor the health and performance of various system components.
- [ ] Configure data exporters and integrations to capture metrics from different services, databases, and infrastructure components.
- [ ] Create custom dashboards and visualizations using Grafana to provide real-time insights into system metrics and performance.
- [ ] Set up alerting rules in Prometheus to proactively detect and respond to critical issues and anomalies.
- [ ] Ensure proper data retention and storage strategies for historical metrics data.
- [ ] Implement secure authentication and access control mechanisms for Grafana to protect sensitive monitoring data.

## Devops — Major module: Designing the Backend as Microservices.

- [ ] Divide the backend into smaller, loosely-coupled microservices, each responsible for specific functions or features.
- [ ] Define clear boundaries and interfaces between microservices to enable independent development, deployment, and scaling.
- [ ] Implement communication mechanisms between microservices, such as RESTful APIs or message queues, to facilitate data exchange and coordination.
- [ ] Ensure that each microservice is responsible for a single, well-defined task or business capability, promoting maintainability and scalability.

## Graphics — Major module: Implementing Advanced 3D Techniques

- [ ] Advanced 3D Graphics: The primary goal of this module is to implement advanced 3D graphics techniques to elevate the visual quality of the Pong game. By utilizing Babylon.js , the goal is to create stunning visual effects that immerse players in the gaming environment.
- [ ] Immersive Gameplay: The incorporation of advanced 3D techniques enhances the overall gameplay experience by providing users with a visually engaging and captivating Pong game.
- [ ] Technology Integration: The chosen technology for this module is Babylon.js . These tools will be used to create the 3D graphics, ensuring compatibility and optimal performance.

## Accessibility — Minor module: Multiple language support.

- [ ] Implement support for a minimum of three languages on the website to accommodate a broad audience.
- [ ] Provide a language switcher or selector that allows users to easily change the website’s language based on their preferences.
- [ ] Translate essential website content, such as navigation menus, headings, and key information, into the supported languages.
- [ ] Ensure that users can navigate and interact with the website seamlessly, regardless of the selected language.
- [ ] Consider using language packs or localization libraries to simplify the translation process and maintain consistency across different languages.
- [ ] Allow users to set their preferred language as the default for subsequent visits.

## Server-Side Pong — Major module: Replace Basic Pong with Server-Side Pong and Implementing an API.

- [ ] Develop server-side logic for the Pong game to handle gameplay, ball movement, scoring, and player interactions.
- [ ] Create an API that exposes the necessary resources and endpoints to interact with the Pong game, allowing partial usage of the game via the Command-Line Interface (CLI) and web interface.
- [ ] Design and implement the API endpoints to support game initialization, player controls, and game state updates.
- [ ] Ensure that the server-side Pong game is responsive, providing an engaging and enjoyable gaming experience.
- [ ] Integrate the server-side Pong game with the web application, allowing users to play the game directly on the website.
