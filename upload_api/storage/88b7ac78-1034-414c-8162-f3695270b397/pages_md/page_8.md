
![Blocks](images/page_8_pic_1.png)


**Figure:** Figure 3
**Caption:** Figure 3: Three Types of Query-Document Alignment
**Description:**
Blocks:
- Traditional Alignment container
- Doc Domain Alignment container
- Query Domain Alignment container
- Query block (green with "WHAT?" lightbulb)
- Query Encoder
- Doc Encoder
- Indexed Database
- Vector Search
- Query Embedding
- Document icon (labeled "Doc")
- LLM (blue box)
- Synthetic Doc (pencil icon)
- Synthetic Doc Embedding
- Synthetic Queries (purple blocks with "Query" lightbulb)
- Checkmark PDF files

Connections:
- Query -> Query Encoder
- Query Encoder -> Query Embedding
- Query Embedding -> Vector Search
- Vector Search -> Indexed Database
- Indexed Database -> Checkmark PDFs
- Document icon -> Doc Encoder
- Doc Encoder -> Indexed Database
- Query -> LLM
- LLM -> Synthetic Doc
- Synthetic Doc -> Doc Encoder
- Doc Encoder -> Synthetic Doc Embedding
- Synthetic Doc Embedding -> Vector Search
- Document icon -> LLM
- LLM -> Synthetic Queries
- Synthetic Queries -> Query Encoder

Summary: The image presents three alignment approaches—Traditional, Doc Domain, and Query Domain—each depicting a workflow for retrieving documents from an indexed database. Traditional Alignment uses a query encoder and document encoder to generate embeddings for search. Doc Domain Alignment introduces LLM-generated synthetic documents to augment the document encoder's processing. Query Domain Alignment leverages LLM-created synthetic queries to enhance the query encoder's input, improving search relevance. All methods integrate vector search with an indexed database to return document outputs with validation checkmarks, illustrating a progression in how queries and documents are processed to optimize retrieval.


Re-ranking and Correction After retrieving the top k text blocks, RAG systems must filter and reorder these segments. Most RAG systems use the relevance scores provided by the retriever as the basis for ranking, while some studies employ specific metrics such as perplexity or perplexity gain as ranking criteria [78, 79]. Other efforts involve using LLMs to evaluate the credibility and utility of retrieved text blocks, training a pluggable reward-driven contextual adapter to refine the output of retriever[80]. Additionally, some research focuses on pre-training a small language model dedicated to fact verification, which is used to filter out incorrect retrieved text chunks, thus improving the quality of the recalled text[81].


Recursive Retrieval or Iterative Retrieval Considering the inherent limitations in the accuracy of a single retrieval attempt, an effective mitigation strategy is to perform multiple retrievals to progressively address any omissions. Kim et al. (2023) introduced a tree-like recursive retrieval method, incorporating pruning strategies to incrementally break down ambiguous questions into disambiguated ones, ultimately arriving at the closest correct answer [82]. Similarly, SEATER uses the k-means algorithm to construct a hierarchical tree structure of items to be retrieved, and iteratively recalls nodes within the tree structure [83].


## 3.3.3 Response Generation Enhancement


Generating responses requires determining if the retrieved information is sufficient or if additional external data is needed. Handling conflicts between retrieved knowledge and the model's internal prior knowledge is also essential [84, 85, 86]. Supervised fine-tuning is an effective method to enhance the generation performance in RAG systems. When faced with irrelevant or erroneous information as the retrieved context, pre-trained large language models are often easily misled, resulting in incorrect responses. Many studies have shown that by subtly designing training data for RAG systems, fine-tuning or pretraining can effectively mitigate this issue [87, 88, 89]. Through experimental analysis, RAAT [89], demonstrated that the detrimental effects of irrelevant retrieval noise, relevant retrieval noise, and counterfactual retrieval noise on RAG models increase progressively. By incorporating with these training process, these methods enables the LLM to internally recognize noisy contexts, leading to significant improvements in response generation quality even in the presence of noisy retrievals. Furthermore, to ensure more consistent performance between the retriever and generator within the RAG system, some studies employ joint training of both retriever and generator during the training phase [90, 91, 92].


## 4 Implicit Fact Queries (L2)


## 4.1 Overview


These queries involve data dependencies that are not immediately obvious and may require some level of common sense reasoning or basic logical deductions. The necessary information might be spread across multiple segments or require simple inferencing. (Example in Figure 2)


Queries at this level require gathering and processing information from multiple documents within the collection. The collection of required information may exceed the ability of a single retrieval request, necessitating the decomposition
