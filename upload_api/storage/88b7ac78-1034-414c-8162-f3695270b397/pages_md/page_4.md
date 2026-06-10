
![Blocks](images/page_4_pic_1.png)


**Figure:** Figure 2
**Caption:** Figure 2: Summary of Query Levels in Data augmented LLM applications
**Description:**
Blocks:
- External Data
- Providing Facts
- Providing Rationales
- Explicit Facts (L1)
- Implicit Facts (L2)
- Interpretatable Rationales (L3)
- Hidden Rationales (L4)
- Query
- Data Dependency

Connections:
- External Data -> Providing Facts
- External Data -> Providing Rationales
- Providing Facts -> Explicit Facts (L1)
- Providing Facts -> Implicit Facts (L2)
- Explicit Facts (L1) -> Query
- Explicit Facts (L1) -> Data Dependency
- Implicit Facts (L2) -> Query
- Implicit Facts (L2) -> Data Dependency
- Interpretatable Rationales (L3) -> Query
- Interpretatable Rationales (L3) -> Data Dependency
- Hidden Rationales (L4) -> Query
- Hidden Rationales (L4) -> Data Dependency

Summary: The image displays a flowchart illustrating how "External Data" is structured into two primary categories: "Providing Facts" and "Providing Rationales". "Providing Facts" splits into "Explicit Facts (L1)" and "Implicit Facts (L2)", each linked to a specific query and its corresponding data dependency. Similarly, "Providing Rationales" divides into "Interpretatable Rationales (L3)" and "Hidden Rationales (L4)", with the same query and data dependency structure, showing a hierarchical framework for organizing external information into layered fact and rationale generation.


processes that were successful. Similarly, in software development, the debugging history of previous bugs can provide a wealth of implicit insights. While the step-by-step rationale for each debugging decision may not be systematically recorded, the LLM must be capable of extracting the underlying principles that guided those decisions. By synthesizing these hidden rationales, the LLM can generate responses that are not only accurate but also reflective of the unspoken expertise and problem-solving approaches that have been honed over time by experienced professionals.


In summary, the classification of queries into levels reflects a gradient of complexity and the type of understanding required from the LLM. As shown in Figure 1 and exampled by Figure 2, the first two levels, Explicit Facts and Implicit Facts , focus on the retrieval of factual information, whether directly stated or requiring basic inferencing. These levels challenge the LLM's ability to extract and synthesize data into coherent facts. Conversely, the latter two levels, Interpretable Rationales and Hidden Rationales , shift the focus towards the LLM's capacity to learn and apply the rationales behind the data. These levels demand a deeper cognitive engagement, where the LLM must align with expert thinking or extract wisdom from unstructured historical data, respectively. The classification of common factual querying datasets according to this standard is depicted in Table 1.


Each level presents its unique set of challenges and, consequently, necessitates tailored solutions to effectively address them. As we delve into the intricacies of these levels in the following sections, we will explore the specific strategies and methodologies that enable LLMs to navigate the complexities of data-augmented applications across these varied spectrums of query types. This exploration will not only highlight the current capabilities of LLMs but also shed light on the ongoing advancements and potential future developments in the field.


## 3 Explicit Fact Queries (L1)


## 3.1 Overview


Explicit fact queries, represent the most straightforward type of data-augmented queries. Queries at this level can be answered by directly accessing specific domain documents or document snippets within the collection. The answers to these questions are often in plain text within the documents, requiring minimal reasoning or simple rationale in the response generation.


The defining characteristic of this level is the clear and direct dependency on specific pieces of external data.
