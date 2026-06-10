
![Blocks](images/page_3_pic_1.png)


**Figure:** Figure 1
**Caption:** Figure 1: Main Focus of Four Level Queries
**Description:**
Blocks:
- Level 1: Explicit Fact Queries
- Level 2: Implicit Fact Queries
- Level 3: Interpretable Rationale Queries
- Level 4: Hidden Rationale Queries
- External Facts
- External Rationales
- External Examples
- External Knowledge Library
- User icon
- LLM block

Connections:
- User icon -> LLM (for all levels)
- External Facts -> Level 1: Explicit Fact Queries (via "How to locate explicit fact?")
- External Facts -> Level 2: Implicit Fact Queries (via "How to connect series of implicit facts?")
- External Rationales -> Level 3: Interpretable Rationale Queries (via "How to follow external rationale?")
- External Examples + External Knowledge Library -> Level 4: Hidden Rationale Queries (via "How to discover hidden rationale?")

Summary: This flowchart outlines a four-level framework for guiding large language models (LLMs) through increasingly complex query-solving stages. It progresses from retrieving explicit facts (Level 1) to connecting implicit facts (Level 2), following interpretable rationales (Level 3), and ultimately discovering hidden rationales (Level 4), with each stage leveraging specific external knowledge sources.


In the landscape of data-augmented LLM applications, queries can be stratified based on their complexity and the depth of data interaction required. This stratification helps in understanding the varying levels of cognitive processing that an LLM must perform to generate accurate and relevant responses. From straightforward fact retrieval to the nuanced interpretation of implicit knowledge, each level represents a step up in the sophistication of the tasks that LLMs are expected to handle. Below, we delineate these levels, providing insights into the unique challenges and capabilities necessitated at each stage.

- Level-1 Explicit Facts : These queries are asking about explicit facts directly present in the given data without requiring any additional reasoning. This is the simplest form of query, where the model's task is primarily to locate and extract the relevant information. For example, "Where will the 2024 Summer Olympics be held?" targets a fact contained in the external data.
- Level-2 Implicit Facts : These queries ask about implicit facts in the data, which are not immediately obvious and may require some level of common sense reasoning or basic logical deductions. The necessary information might be spread across multiple segments or require simple inferencing. For instance, the question "What is the majority party now in the country where Canberra is located?" can be answered by combining the fact that Canberra is in Australia with the information about the current majority party in Australia.
- Level-3 Interpretable Rationales : These queries demand not only a grasp of the factual content but also the capacity to comprehend and apply domain-specific rationales that are integral to the data's context. These rationales are often explicitly provided in external resources and is typically not present or rarely encountered during the pre-training phase of a general large language model. For example, in the realm of pharmaceuticals, an LLM must interpret FDA Guidance 1 documents-which represent the FDA's current thinking-to evaluate whether a specific drug application adheres to regulatory requirements. Similarly, in customer support scenarios, the LLMmust navigate the intricacies of a predefined workflow to process user inquiries effectively. In the medical field, many diagnostic manuals provide authoritative and standardized diagnostic criteria, such as management guidelines for patients with acute chest pain [14]. By effectively following these external rationales, it is possible to develop a specialized LLM expert system for managing chest pain. This involves understanding the procedural steps and decision trees that guide a support agent's interactions with customers, ensuring responses are not only accurate but also comply with the company's service standards and protocols.
- Level-4 Hidden Rationales : This category of queries delves into the more challenging realm where the rationales are not explicitly documented but must be inferred from patterns and outcomes observed in external data. The hidden rationales here refer not only to the implicit reasoning chains and logical relationships, but also to the inherently challenging and non-trivial task of identifying and extracting the external rationales required for each specific query. In IT operational scenarios, for example, a cloud operations team may have addressed numerous incidents in the past, each with its own unique set of circumstances and resolutions. The LLM must be adept at mining this rich repository of tacit knowledge to discern the implicit strategies and decision-making

1 https://www.fda.gov/industry/fda-basics-industry/guidances
