# Requirements Document

## Introduction

The AI Visibility Monitor is an AI answer-engine optimisation (AEO/GEO) monitoring tool that tracks how brands appear in AI-generated answers across ChatGPT, Perplexity, and Google AI Overviews. It provides a transparent evidence layer showing raw prompts, answers, citations, and competitor comparisons. The MVP targets Indian and global B2B SaaS marketers, content agencies, and growth teams who need to understand and improve their brand's visibility in AI-generated responses.

## Glossary

- **Workspace**: An isolated environment containing brand configuration, prompts, competitors, and collected data for one brand or client
- **Prompt**: A natural-language query submitted to AI engines to monitor brand visibility in responses
- **Engine**: An AI answer platform queried for responses (ChatGPT API, Perplexity Sonar API, Google AI Overview via SERP provider)
- **Run**: A scheduled or manual execution of all active prompts across configured engines within a workspace
- **Visibility_Score**: A computed metric (0-100) representing how prominently a brand appears in AI-generated answers
- **Citation**: A URL or source reference extracted from an AI engine response that links to external content
- **Mention**: An occurrence of a brand name, alias, or domain within an AI-generated response
- **Entity_Extractor**: The subsystem responsible for identifying brand mentions, citations, and competitor references within raw AI responses
- **Metric_Engine**: The subsystem that computes visibility scores, mention counts, position averages, and citation rates from extracted data
- **Scheduler**: The subsystem responsible for triggering weekly runs and managing job queues
- **Dashboard**: The web interface presenting visibility metrics, competitor comparisons, citations, and recommendations
- **Recommendation_Engine**: The subsystem that generates actionable suggestions based on visibility data and competitor gaps
- **SERP_Provider**: A licensed third-party service that returns Google AI Overview/Mode content via API
- **Brand_Profile**: The configuration containing brand name, domain, aliases, and competitor definitions for a workspace
- **Baseline_Run**: The first complete execution of all prompts across engines, establishing initial visibility metrics
- **Confidence_Score**: A numeric indicator (0-1) of how certain the Entity_Extractor is about a brand mention or citation match
- **Prompt_Manager**: The subsystem responsible for creating, validating, archiving, and suggesting prompts within a workspace
- **Data_Store**: The persistence layer responsible for storing raw responses, computed metrics, audit logs, and versioned configuration
- **Notification_System**: The subsystem responsible for sending emails, in-app alerts, and digest notifications to users
- **Admin_Panel**: The administrative interface for platform operators to monitor costs, usage, and system health
- **Onboarding_Wizard**: The guided setup flow that walks new users through workspace configuration
- **Share_of_Voice**: The percentage of total AI mentions captured by the monitored brand relative to all configured competitors
- **Engine_Adapter**: A standardized interface that each engine integration module implements for consistent prompt execution and response parsing
- **Circuit_Breaker**: A fault-tolerance pattern that temporarily halts requests to a failing engine after consecutive failures

## Requirements

### Requirement 1: Workspace and User Management

**User Story:** As a growth team lead, I want to create and manage workspaces with role-based access, so that I can organize monitoring for different brands and control who can view or modify data.

#### Acceptance Criteria

1. WHEN a user signs up, THE Workspace SHALL create a default workspace associated with the user as owner
2. WHEN an owner invites a user to a workspace, THE Workspace SHALL assign the invited user a role of either "owner" or "viewer"
3. WHILE a user has the "viewer" role, THE Workspace SHALL restrict that user to read-only access for all workspace data
4. WHILE a user has the "owner" role, THE Workspace SHALL permit full create, read, update, and delete operations on workspace configuration and data
5. WHEN a user belongs to multiple workspaces, THE Dashboard SHALL display a workspace switcher allowing navigation between workspaces
6. IF a user attempts an action exceeding their role permissions, THEN THE Workspace SHALL reject the action and display an "insufficient permissions" message

### Requirement 2: Brand and Competitor Configuration

**User Story:** As a startup founder, I want to configure my brand identity and competitors, so that the system can accurately track mentions and compare my visibility against competitors.

#### Acceptance Criteria

1. WHEN a user completes onboarding, THE Brand_Profile SHALL store the brand name, primary domain, and up to three brand aliases
2. WHEN a user adds competitors, THE Brand_Profile SHALL accept up to five competitor entries, each containing a name and domain
3. WHEN a brand name or alias is updated, THE Entity_Extractor SHALL use the updated values for all subsequent runs
4. IF a user attempts to add more than five competitors, THEN THE Brand_Profile SHALL reject the addition and display the plan limit
5. THE Brand_Profile SHALL validate that the primary domain is a well-formed URL or domain string before saving
6. WHEN a user removes a competitor, THE Brand_Profile SHALL retain historical data for that competitor but exclude it from future runs

### Requirement 3: Prompt Management

**User Story:** As a content marketer, I want to manage a set of monitoring prompts with attributes, so that I can track visibility across different topics, intents, and engines.

#### Acceptance Criteria

1. WHEN a user creates a workspace, THE Prompt_Manager SHALL offer AI-suggested prompts based on the brand name and domain
2. WHEN a user creates a prompt, THE Prompt_Manager SHALL require the following attributes: text, intent category, topic, target geography, language, and target engines
3. THE Prompt_Manager SHALL enforce a maximum of 25 active prompts per workspace
4. IF a user attempts to create a prompt exceeding the workspace limit, THEN THE Prompt_Manager SHALL reject the creation and display the current count and maximum
5. WHEN a user archives a prompt, THE Prompt_Manager SHALL exclude it from future runs while retaining all historical data
6. WHEN a user edits a prompt's text, THE Prompt_Manager SHALL treat the edited prompt as a new prompt for metric tracking purposes, preserving the original prompt's historical data
7. THE Prompt_Manager SHALL allow users to assign one or more engines (ChatGPT, Perplexity, Google AI Overview) to each prompt

### Requirement 4: Data Collection and Engine Execution

**User Story:** As a growth lead, I want the system to automatically query AI engines on a weekly schedule, so that I have consistent longitudinal data without manual effort.

#### Acceptance Criteria

1. THE Scheduler SHALL execute a full run of all active prompts across their assigned engines once per week at the configured time
2. WHEN a user triggers a manual run, THE Scheduler SHALL queue and execute all active prompts within 15 minutes
3. WHEN querying Perplexity, THE Data_Collector SHALL use the Sonar API and store the complete response text, citations array, and response metadata
4. WHEN querying ChatGPT, THE Data_Collector SHALL use the OpenAI Chat Completions API and store the complete response text and model metadata
5. WHEN querying Google AI Overview, THE Data_Collector SHALL use the configured SERP_Provider API and store the AI overview text, cited URLs, and organic result context
6. THE Data_Collector SHALL store a timestamp, engine identifier, prompt identifier, raw response, and execution status for every prompt-engine execution
7. IF an engine API returns an error or times out, THEN THE Data_Collector SHALL retry the request up to three times with exponential backoff before marking the execution as failed
8. IF an execution fails after all retries, THEN THE Data_Collector SHALL log the error details and continue processing remaining prompts without blocking the run
9. THE Data_Collector SHALL achieve a run success rate of 95% or higher measured across all prompt-engine executions in a calendar month

### Requirement 5: Entity and Citation Extraction

**User Story:** As a content marketer, I want the system to accurately identify brand mentions and citations in AI responses, so that I can understand exactly where and how my brand appears.

#### Acceptance Criteria

1. WHEN a response is collected, THE Entity_Extractor SHALL identify exact matches of the brand name, aliases, and competitor names within the response text
2. WHEN a response is collected, THE Entity_Extractor SHALL perform fuzzy matching to detect partial or variant mentions of configured brand names and aliases
3. WHEN a response contains URLs, THE Entity_Extractor SHALL extract all URLs and normalize them to base domain form for citation analysis
4. THE Entity_Extractor SHALL classify each citation as belonging to the monitored brand, a configured competitor, or an unrelated third party
5. WHEN a mention is detected, THE Entity_Extractor SHALL record the position (first, middle, last third) of the mention within the response
6. WHEN a mention is detected, THE Entity_Extractor SHALL assign a Confidence_Score between 0 and 1 indicating match certainty
7. IF the Confidence_Score for a mention is below 0.7, THEN THE Entity_Extractor SHALL flag the mention as ambiguous for manual review
8. THE Entity_Extractor SHALL detect recommendation-strength language (e.g., "recommended", "best option", "top choice") associated with brand mentions

### Requirement 6: Metric Computation

**User Story:** As an agency account manager, I want computed visibility metrics aggregated across multiple dimensions, so that I can quickly assess and report on client performance.

#### Acceptance Criteria

1. WHEN extraction completes for a run, THE Metric_Engine SHALL compute a Visibility_Score (0-100) for each prompt-engine combination using four equally-weighted factors (25% each): mention presence (binary: mentioned or not), mention position (first third = 100%, middle = 66%, last third = 33%), recommendation strength (explicit recommendation = 100%, neutral mention = 50%, no mention = 0%), and citation inclusion (brand URL cited = 100%, not cited = 0%)
2. THE Metric_Engine SHALL compute aggregate Visibility_Score values at the workspace level by averaging across all prompt-engine combinations weighted equally
3. THE Metric_Engine SHALL compute mention count, average mention position, and citation rate for each prompt-engine-date combination
4. WHEN a new run completes, THE Metric_Engine SHALL compute week-over-week change values for Visibility_Score, mention count, and citation rate
5. THE Metric_Engine SHALL compute per-competitor Visibility_Score values using the same formula applied to competitor mentions
6. THE Metric_Engine SHALL link every computed metric to the specific raw response data from which it was derived

### Requirement 7: Dashboard and Reporting

**User Story:** As a startup founder, I want a clear dashboard showing my brand's AI visibility with drill-down capability, so that I can quickly identify opportunities and track progress.

#### Acceptance Criteria

1. THE Dashboard SHALL display an overview panel showing workspace-level Visibility_Score, total mentions, citation rate, and week-over-week trends
2. THE Dashboard SHALL display a prompt-level table showing each prompt's Visibility_Score, mention count, and citation count per engine
3. THE Dashboard SHALL display a competitor comparison view showing side-by-side Visibility_Score values for the brand and all configured competitors
4. THE Dashboard SHALL display a citation sources panel listing all extracted citations grouped by domain with frequency counts
5. WHEN a user clicks on any metric, THE Dashboard SHALL navigate to the underlying raw response data that produced that metric
6. THE Dashboard SHALL display AI-generated recommendations with evidence text, suggested action, estimated impact level (high/medium/low), and confidence rating
7. WHEN a user requests an export, THE Dashboard SHALL generate a CSV file containing all visible metrics and prompt-level data
8. THE Dashboard SHALL use a white-dominant color scheme with purple/violet gradient accents for primary actions and visual hierarchy

### Requirement 8: Recommendations Engine

**User Story:** As a content marketer, I want actionable recommendations backed by evidence, so that I can prioritize content improvements that will increase AI visibility.

#### Acceptance Criteria

1. WHEN a run completes, THE Recommendation_Engine SHALL generate recommendations based on visibility gaps, competitor advantages, and citation patterns
2. THE Recommendation_Engine SHALL include for each recommendation: evidence text from raw responses, a specific suggested action, an impact level (high/medium/low), and a confidence rating
3. THE Recommendation_Engine SHALL prioritize recommendations by estimated impact level
4. THE Recommendation_Engine SHALL use cost-efficient models (Claude Haiku, Claude Sonnet, or GPT-3.5) for classification and extraction tasks
5. THE Recommendation_Engine SHALL use higher-capability models only for generating recommendation text and complex analysis

### Requirement 9: Notifications

**User Story:** As a growth lead, I want to be notified when important events occur, so that I can stay informed without constantly checking the dashboard.

#### Acceptance Criteria

1. WHEN a Baseline_Run completes, THE Notification_System SHALL send an email to the workspace owner with a summary of initial visibility metrics
2. WHERE a user has enabled weekly summaries, THE Notification_System SHALL send a weekly email digest containing Visibility_Score changes and top recommendations
3. IF a scheduled run fails for more than 50% of prompt-engine executions, THEN THE Notification_System SHALL send an in-app alert and email to workspace owners
4. WHEN a notification is sent, THE Notification_System SHALL include a direct link to the relevant dashboard view

### Requirement 10: Admin and Cost Controls

**User Story:** As a platform administrator, I want visibility into system costs and usage, so that I can manage API spend and ensure fair resource allocation across workspaces.

#### Acceptance Criteria

1. THE Admin_Panel SHALL display per-workspace API usage counts broken down by engine
2. THE Admin_Panel SHALL display estimated cost per workspace based on API call volumes and model pricing
3. THE Admin_Panel SHALL display a log of all failed executions with error details, timestamps, and affected prompts
4. WHEN a workspace exceeds its plan's prompt limit, THE Admin_Panel SHALL flag the workspace and prevent additional prompt creation
5. THE Admin_Panel SHALL display total platform-level metrics including active workspaces, total prompts, monthly executions, and estimated monthly cost
6. IF estimated monthly cost for a workspace exceeds a configured threshold, THEN THE Admin_Panel SHALL generate an alert for platform administrators

### Requirement 11: Onboarding Wizard

**User Story:** As a new user, I want a guided onboarding experience, so that I can quickly configure my workspace and see initial results without reading documentation.

#### Acceptance Criteria

1. WHEN a user creates a new workspace, THE Onboarding_Wizard SHALL guide the user through sequential steps: brand name entry, domain entry, competitor addition, and prompt selection
2. WHEN the user enters a brand name and domain, THE Onboarding_Wizard SHALL generate AI-suggested prompts relevant to the brand's industry and domain
3. WHEN the user completes onboarding, THE Scheduler SHALL automatically trigger a Baseline_Run within 5 minutes
4. THE Onboarding_Wizard SHALL allow users to skip optional steps (competitor addition) and return to complete them later
5. WHEN the Baseline_Run completes, THE Dashboard SHALL display a first-run summary highlighting key findings and next steps

### Requirement 12: Data Retention and Versioning

**User Story:** As an agency account manager, I want historical data preserved across configuration changes, so that I can demonstrate long-term trends to clients.

#### Acceptance Criteria

1. THE Data_Store SHALL retain all raw response data and computed metrics for a minimum of 12 months
2. WHEN a brand name or alias is modified, THE Data_Store SHALL version the Brand_Profile and associate historical data with the profile version active at collection time
3. WHEN a prompt is edited, THE Data_Store SHALL create a new prompt version while preserving the original version and its associated data
4. THE Data_Store SHALL support querying historical metrics by date range, prompt version, and Brand_Profile version
5. IF a workspace is deleted, THEN THE Data_Store SHALL soft-delete all associated data and retain it for 30 days before permanent removal

### Requirement 13: Security and Compliance

**User Story:** As a platform administrator, I want the system to follow security best practices, so that user data is protected and API integrations are compliant.

#### Acceptance Criteria

1. THE System SHALL authenticate all API requests using workspace-scoped API keys or session tokens
2. THE System SHALL encrypt all data at rest using AES-256 encryption
3. THE System SHALL encrypt all data in transit using TLS 1.2 or higher
4. THE System SHALL store AI engine API keys in an encrypted secrets manager, never in application code or environment variables accessible to application logs
5. THE System SHALL enforce role-based access control for all workspace operations as defined in Requirement 1
6. IF an authentication token expires or is invalid, THEN THE System SHALL reject the request with a 401 status and require re-authentication
7. THE System SHALL log all authentication events and permission-denied actions for security audit purposes

### Requirement 14: Scalability and Performance

**User Story:** As a platform administrator, I want the system to handle growth efficiently, so that performance remains acceptable as the user base expands.

#### Acceptance Criteria

1. THE System SHALL support 100 concurrent workspaces each with 25 active prompts without degradation of scheduled run completion times
2. THE Scheduler SHALL process runs asynchronously using a job queue to prevent blocking of the web application
3. WHEN a dashboard is loaded, THE System SHALL render the overview panel within 3 seconds for workspaces with up to 25 prompts and 52 weeks of historical data
4. THE System SHALL support up to 60,000 prompt-engine executions per month without requiring architectural changes
5. THE Data_Collector SHALL implement rate limiting per engine API to stay within provider quotas and prevent cost overruns

### Requirement 15: Response Drift and Non-Determinism Handling

**User Story:** As a growth lead, I want the system to account for AI response variability, so that my visibility scores reflect genuine trends rather than random LLM output fluctuations.

#### Acceptance Criteria

1. WHEN a scheduled run executes, THE Data_Collector SHALL query each prompt-engine combination once per run cycle to establish a single data point per period
2. WHEN displaying week-over-week changes, THE Dashboard SHALL flag score changes of less than 10 points as "within normal variance" to prevent overreaction to noise
3. THE Metric_Engine SHALL compute a rolling 4-week average Visibility_Score alongside the point-in-time score for trend smoothing
4. WHEN a Visibility_Score changes by more than 30 points between consecutive runs, THE Dashboard SHALL flag the change as "significant shift" and surface it in recommendations
5. THE Data_Store SHALL retain the exact model version identifier (e.g., "gpt-4o-2024-05-13") used for each execution to enable variance attribution when models update

### Requirement 16: Prompt Quality and Validation

**User Story:** As a content marketer, I want the system to validate my prompts before execution, so that I avoid wasting API credits on poorly formed queries that produce unusable results.

#### Acceptance Criteria

1. WHEN a user creates or edits a prompt, THE Prompt_Manager SHALL validate that the prompt text is between 10 and 500 characters
2. WHEN a user creates a prompt, THE Prompt_Manager SHALL warn if the prompt is substantially similar (>80% text overlap) to an existing active prompt in the workspace
3. IF a prompt produces empty or error responses from an engine for two consecutive runs, THEN THE Prompt_Manager SHALL flag the prompt as "underperforming" and notify the workspace owner
4. THE Prompt_Manager SHALL categorize prompts by intent type (informational, navigational, commercial, transactional) to enable intent-based visibility analysis
5. WHEN AI-suggested prompts are generated, THE Prompt_Manager SHALL include prompts across all four intent categories to ensure comprehensive coverage

### Requirement 17: Competitor Intelligence Edge Cases

**User Story:** As an agency account manager, I want accurate competitor tracking even when competitors share similar names or domains, so that my client reports are trustworthy.

#### Acceptance Criteria

1. WHEN configuring competitors, THE Brand_Profile SHALL allow users to add disambiguation aliases (e.g., "Notion" vs "notion.so" vs "Notion app") to reduce false positives
2. IF the Entity_Extractor detects a mention that matches multiple configured entities (brand and competitor share a common word), THEN THE Entity_Extractor SHALL use context analysis to assign the mention to the most likely entity and flag it for review
3. WHEN a competitor is mentioned but the monitored brand is not, THE Metric_Engine SHALL record this as a "competitor-only" appearance for gap analysis
4. THE Dashboard SHALL display a "share of voice" metric showing the brand's mention percentage relative to all configured competitors across all prompts
5. WHEN a competitor's Visibility_Score exceeds the brand's score by more than 20 points on a specific prompt, THE Recommendation_Engine SHALL generate a targeted recommendation for that prompt

### Requirement 18: Graceful Degradation and Error Recovery

**User Story:** As a platform administrator, I want the system to handle partial failures gracefully, so that users still receive value even when individual engines or services are temporarily unavailable.

#### Acceptance Criteria

1. IF one engine API is unavailable during a scheduled run, THEN THE Scheduler SHALL complete the run for all other engines and mark the unavailable engine's executions as "skipped - engine unavailable"
2. WHEN an engine is marked unavailable, THE Dashboard SHALL display partial results with a clear indicator showing which engine data is missing
3. IF the Entity_Extractor encounters a response it cannot parse, THEN THE Entity_Extractor SHALL store the raw response, mark extraction as "failed", and continue processing other responses
4. WHEN a run completes with partial failures (less than 50% failure rate), THE Notification_System SHALL include a summary of skipped or failed executions in the run completion notification
5. IF the SERP_Provider returns stale or cached data (indicated by response headers or timestamps older than 7 days), THEN THE Data_Collector SHALL flag the response as "potentially stale" and log a warning
6. THE System SHALL implement circuit-breaker logic per engine: after 5 consecutive failures for an engine within 1 hour, THE System SHALL pause requests to that engine for 30 minutes before retrying

### Requirement 19: Data Integrity and Audit Trail

**User Story:** As an agency account manager, I want confidence that the data shown is accurate and traceable, so that I can present findings to clients without doubt.

#### Acceptance Criteria

1. THE Data_Store SHALL maintain an immutable audit log of all run executions including start time, end time, prompts executed, engines queried, and success/failure status
2. WHEN a metric is displayed on the Dashboard, THE System SHALL provide a "view source" action that shows the exact raw response text and extraction results that produced the metric
3. THE Entity_Extractor SHALL log all extraction decisions including matched text, match type (exact/fuzzy), confidence score, and position for auditability
4. IF a user disputes a visibility score, THEN THE Dashboard SHALL provide a score breakdown showing the contribution of each factor (mention presence, position, recommendation strength, citation) to the final score
5. THE Data_Store SHALL compute and store a checksum for each raw response to detect any data corruption during storage or retrieval

### Requirement 20: Rate Limiting and Fair Usage

**User Story:** As a platform administrator, I want to prevent any single workspace from consuming disproportionate resources, so that all users experience consistent service quality.

#### Acceptance Criteria

1. THE System SHALL enforce a maximum of one manual run per workspace per 24-hour period to prevent API cost abuse
2. THE System SHALL queue manual runs behind any in-progress scheduled runs to prevent resource contention
3. IF a workspace's API consumption exceeds 150% of its plan allocation in a billing period, THEN THE Admin_Panel SHALL throttle that workspace's next scheduled run to off-peak hours
4. THE Scheduler SHALL distribute scheduled runs across the week to prevent all workspaces from executing simultaneously
5. THE System SHALL implement per-engine rate limiting that respects provider quotas: OpenAI (60 requests/minute), Perplexity (50 requests/minute), SERP provider (as per contract)

### Requirement 21: Engine Extensibility

**User Story:** As a platform developer, I want a modular engine architecture, so that new AI engines can be added in future versions without restructuring the system.

#### Acceptance Criteria

1. THE Data_Collector SHALL implement each engine integration as an independent module conforming to a common Engine_Adapter interface
2. THE Engine_Adapter interface SHALL define methods for: executing a prompt, parsing the response into a standardized format, and reporting execution status
3. WHEN a new engine module is added, THE System SHALL require no changes to the Scheduler, Entity_Extractor, or Metric_Engine subsystems
4. THE Engine_Adapter interface SHALL include a method for reporting engine-specific rate limits and cost-per-call metadata
5. THE System SHALL store engine type as a configurable attribute on each prompt, allowing new engine types to be assigned without schema changes
