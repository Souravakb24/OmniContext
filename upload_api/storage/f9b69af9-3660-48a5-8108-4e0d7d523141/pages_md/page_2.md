
![Blocks](images/page_2_pic_1.png)


**Figure:** Figure 1
**Caption:** Figure 1: Tree construction process: RAPTOR recursively clusters chunks of text based on their vector embeddings and generates text summaries of those clusters, constructing a tree from the bottom up. Nodes clustered together are siblings; a parent node contains the text summary of that cluster.
**Description:**
Blocks:
- RAPTOR Tree
- Root layer
- Leaf layer
- Formation of one tree layer
- Clustering
- Summarization by LLM
- Text chunks
- Contents of a node
- Index #8
- Child Nodes: 2, 3
- Text: summary of nodes 2 and 3
- Text Embedding
Connections:
- Text chunks → Clustering (1. Clustering)
- Clustering (1.) → Summarization by LLM (2. Summarization by LLM)
- Leaf layer → Formation of one tree layer
- Formation of one tree layer → Contents of a node
Summary: The image outlines a computational pipeline for RAPTOR tree construction, illustrating the root and leaf layers of the tree, the process of forming a single tree layer through clustering of text chunks followed by LLM-based summarization, and the detailed structure of a node including its index, child nodes, text summary, and associated text embedding.


Our main contribution is the idea of using text summarization to allow retrieval augmentation of context at different scales, and to show its effectiveness in experiments on collections of long documents. Controlled experiments with three language models (UnifiedQA (Khashabi et al., 2020), GPT-3 (Brown et al., 2020) and GPT-4 (OpenAI, 2023)) show that RAPTOR outperforms current retrieval augmentation. Moreover, RAPTOR coupled with GPT-4, and sometimes even with UnifiedQA, gives new state-of-the-art results on three QA tasks: free text response questions on books and movies (NarrativeQA, Koˇ cisk` y et al. 2018), full-text NLP papers (QASPER, Dasigi et al. 2021), and multiple-choice questions based on medium-length passages (QuALITY, Pang et al. 2022). 1


## 2 RELATED WORK


Why Retrieval? Recent advances in hardware and algorithms have indeed expanded the context lengths that models can handle, leading to questions about the need for retrieval systems (Dai et al., 2019; Dao et al., 2022; Liu et al., 2023). However, as Liu et al. (2023) and Sun et al. (2021) have noted, models tend to underutilize long-range context and see diminishing performance as context length increases, especially when pertinent information is embedded within a lengthy context. Moreover, practically, use of long contexts is expensive and slow. This suggests that selecting the most relevant information for knowledge-intensive tasks is still crucial.


Retrieval Methods Retrieval-augmented language models (RALMs) have seen improvements in various components: the retriever, the reader, and end-to-end system training. Retrieval methods have transitioned from traditional term-based techniques like TF-IDF (Sp¨ arck Jones, 1972) and BM25 (Robertson et al., 1995; Roberts et al., 2020) to deep learning-based strategies (Karpukhin et al., 2020; Khattab & Zaharia, 2020; Sachan et al., 2023). Some recent work proposes using large language models as retrievers due to their ability to memorize extensive knowledge (Yu et al., 2022; Sun et al., 2022). Research on the reader component includes Fusion-in-Decoder (FiD) (Izacard & Grave, 2022), which employs both DPR and BM25 for retrieval and processes passages independently in the encoder and RETRO (Borgeaud et al., 2022; Wang et al., 2023), which utilizes cross-chunked attention and chunkwise retrieval to generate text grounded on retrieved context.


End-to-end system training work includes Atlas (Izacard et al., 2022), which fine-tunes an encoderdecoder model in conjunction with the retriever; REALM (Guu et al., 2020), a bidirectional, masked LM fine-tuned for open-domain question answering; and RAG (Retrieval-Augmented Generation) (Lewis et al., 2020), which integrates pre-trained sequence-to-sequence models with a neural retriever. Min et al. (2021) introduced Joint Passage Retrieval (JPR) model which uses a treedecoding algorithm to handle passage diversity and relevance in multi-answer retrieval. Dense Hierarchical Retrieval (DHR) and Hybrid Hierarchical Retrieval (HHR) represent advancements in retrieval accuracy by combining document and passage level retrievals and integrating sparse and dense retrieval methods, respectively (Liu et al., 2021; Arivazhagan et al., 2023).


1 We will release the code of RAPTOR publicly here.
