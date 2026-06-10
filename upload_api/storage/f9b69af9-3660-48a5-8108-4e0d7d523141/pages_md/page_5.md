
![Blocks](images/page_5_pic_1.png)


**Figure:** Figure 2
**Caption:** Figure 2: Illustration of the tree traversal and collapsed tree retrieval mechanisms. Tree traversal starts at the root level of the tree and retrieves the topk (here, top1 ) node(s) based on cosine similarity to the query vector. At each level, it retrieves the topk node(s) from the child nodes of the previous layer's topk . Collapsed tree collapses the tree into a single layer and retrieves nodes until a threshold number of tokens is reached, based on cosine similarity to the query vector. The nodes on which cosine similarity search is performed are highlighted in both illustrations.
**Description:**
Blocks:
- Query
- Encoder
- q
- Tree Structure
- Collapsed Tree Structure
- Retrieved Context
- LLM
- Answer

Connections:
- Query -> Encoder
- Encoder -> q
- q -> Tree Structure
- q -> Collapsed Tree Structure
- Tree Structure -> Retrieved Context
- Collapsed Tree Structure -> Retrieved Context
- Retrieved Context + Query -> LLM
- LLM -> Answer

Summary: The image presents two tree-based retrieval approaches. Both start with encoding a query to produce "q," which then interacts with either a standard tree structure (A) or a collapsed tree structure (B) to retrieve context. The retrieved context combines with the original query, is processed by a large language model (LLM), and generates the final answer. The key difference between the methods lies in the structure used for context retrieval, with the collapsed version likely streamlining the traversal process while maintaining the overall flow of query encoding, context retrieval, and answer generation.

- Proceed to the child nodes of the elements in set S 1 . Compute the cosine similarity between the query vector and the vector embeddings of these child nodes.
- Select the top k child nodes with the highest cosine similarity scores to the query, forming the set S 2 .
- Continue this process recursively for d layers, producing sets S 1 , S 2 , . . . , S d .
- Concatenate sets S 1 through S d to assemble the relevant context to the query.

By adjusting the depth d and the number of nodes k selected at each layer, the tree traversal method offers control over the specificity and breadth of the information retrieved. The algorithm starts with a broad outlook by considering the top layers of the tree and progressively focuses on finer details as it descends through the lower layers.


The collapsed tree approach offers a simpler way to search for relevant information by considering all nodes in the tree simultaneously, as depicted in Figure 2. Instead of going layer-by-layer, this method flattens the multi-layered tree into a single layer, essentially bringing all the nodes onto the same level for comparison. The steps for this method are outlined below:

- First, collapse the entire RAPTOR tree into a single layer. This new set of nodes, denoted as C , contains nodes from every layer of the original tree.
- Next, calculate the cosine similarity between the query embedding and the embeddings of all nodes present in the collapsed set C .
- Finally, pick the topk nodes that have the highest cosine similarity scores with the query. Keep adding nodes to the result set until you reach a predefined maximum number of tokens, ensuring you don't exceed the model's input limitations.

We tested both approaches on 20 stories from the QASPER dataset. Figure 3 shows the performance of tree traversal with different top- sizes and collapsed tree with different maximum token numbers. The collapsed tree approach consistently performs better. We believe collapsed tree retrieval is better due to offering greater flexibility than tree traversal; i.e., by searching through all the nodes simultaneously, it retrieves information that is at the correct level of granularity for a given question. In comparison, while using tree traversal with the same values of d and k , the ratio of nodes from each level of the tree will be constant. So, the ratio of higher-order thematic information to granular details will remain the same regardless of the question.
