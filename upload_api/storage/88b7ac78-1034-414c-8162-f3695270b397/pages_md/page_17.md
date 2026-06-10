
![Blocks](images/page_17_pic_1.png)


**Figure:** Figure 6
**Caption:** Figure 6: Three ways to inject specific domain data into an LLM: a) extracting part of the domain data based on the query as context input for the LLM, b) training a smaller model with specific domain data, which then guides the integration of external information subsequently input into the LLM, and c) directly using external domain knowledge to fine-tune a general large language model to become a domain-expert model.
**Description:**
Blocks:
- Context
- Small Model
- Fine-tuning
- Document icons
- Search icon
- Retrieved document icon
- Training node icon
- LLM
- Expert LLM
Connections:
- Context (document icons) -> search icon -> retrieved document -> LLM
- Small Model (document icons) -> train -> training node -> LLM
- Small Model (LLM) -> retrieved document -> Small Model (labeled "retrieve, correct, route, ...")
- Fine-tuning (document icon + LLM) -> SFT -> Expert LLM
Summary: The image depicts a flowchart outlining a three-stage AI model pipeline. In the Context stage, document processing leads to LLM output via search and document retrieval. The Small Model stage involves training, iterative retrieval/correction/routing steps, and LLM interaction. The Fine-tuning stage combines documents and LLMs through SFT to produce an Expert LLM, illustrating a progression from basic LLM use to fine-tuned specialized model production.


dataset for the Chinese judicial domain, fine-tuning LLMs to effectively serve a variety of users in different legal scenarios with enhanced legal reasoning capabilities.


## 7 Conclusion


In this paper, we delineate data augmented LLM applications into four distinct categories based on the primary focus of queries, each facing unique challenges and thus requiring tailored solutions, as illustrated in Figure 5. For queries related to static common knowledge, deploying a general LLM through a Chain of Thought methodology is effective. For explicit fact queries, the main challenge involves pinpointing the exact location of facts within a database, thus making a basic RAG the method of choice. In the case of implicit fact queries, which require the collation of multiple related facts, iterative RAG and RAG implementations on graph or tree structures are preferred for their ability to concurrently retrieve individual facts and interconnect multiple data points. When extensive data linkage is necessary, text-to-SQL techniques prove indispensable, leveraging database tools to facilitate external data searches. For interpretable rationale queries, advancements through prompt tuning and CoT prompting are critical to enhance LLMs' compliance with external directives. The most formidable are hidden rationale queries, which demand the autonomous synthesis of problem-solving approaches from extensive data sets. Here, offline learning, in-context learning , and fine-tuning emerge as vital methodologies.


Prior to the development of a targeted LLM application, as domain experts, we must acquire an in-depth understanding of the intended task, ascertain the complexity level of the associated queries, and select corresponding technological approaches for resolution. These methods principally inject knowledge into LLMs via three mechanisms, as depicted in Figure 6: a) extracting part of the domain data based on the query as context input for the LLM, b) training a smaller model with specific domain data, which then guides the integration of external information subsequently input into the LLM, and c) directly using external domain knowledge to fine-tune a general large language model to become a domain-expert model. These strategies differ in their requirements for data volume, training duration, and computational resources, escalating respectively. Knowledge injection through context provides better interpretability and stability but faces limitations due to the finite context window and potential information loss in the middle [40], ideally suited for scenarios where data can be succinctly explained in shorter texts. However, this method challenges the model's retrieval capabilities and knowledge extraction ability. The small model approach offers the advantage of reduced training times and the capacity to assimilate considerable amounts of data, yet its efficacy is contingent upon the model's capabilities, potentially capping the LLM's performance for more complex tasks and incurring additional training costs with data increasing. Fine-tuning facilitates the utilization of large model capacities with extensive domain-specific data, yet its impact on the LLM strongly depends on the design of the data used. Employing out-of-domain factual data for fine-tuning may inadvertently lead to the generation of more erroneous outputs by the LLM, while also risking the loss of previously known domain knowledge and the neglect of unencountered tasks during fine-tuning [110, 195].
