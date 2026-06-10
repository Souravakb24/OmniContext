
Alon Talmor, Yanai Elazar, Yoav Goldberg, and Jonathan Berant. oLMpics- on what language model pre-training captures. Transactions of the Association for Computational Linguistics , 8: 743-758, 2020. URL https://arxiv.org/abs/1912.13283 .


Boxin Wang, Wei Ping, Peng Xu, Lawrence McAfee, Zihan Liu, Mohammad Shoeybi, Yi Dong, Oleksii Kuchaiev, Bo Li, Chaowei Xiao, et al. Shall we pretrain autoregressive language models with retrieval? a comprehensive study. arXiv preprint arXiv:2304.06762 , 2023. URL https: //arxiv.org/abs/2304.06762 .


Jeff Wu, Long Ouyang, Daniel M. Ziegler, Nisan Stiennon, Ryan Lowe, Jan Leike, and Paul Christiano. Recursively Summarizing Books with Human Feedback, 2021. URL https: //arxiv.org/abs/2109.10862 .


Adams Wei Yu, David Dohan, Minh-Thang Luong, Rui Zhao, Kai Chen, Mohammad Norouzi, and Quoc V. Le. QANet: Combining Local Convolution with Global Self-Attention for Reading Comprehension, 2018. URL https://arxiv.org/abs/1804.09541 . arXiv preprint arXiv:1804.09541.


Wenhao Yu, Dan Iter, Shuohang Wang, Yichong Xu, Mingxuan Ju, Soumya Sanyal, Chenguang Zhu, Michael Zeng, and Meng Jiang. Generate rather than retrieve: Large Language Models are strong context generators, 2022. URL https://arxiv.org/abs/2209.10063 .


Shiyue Zhang, David Wan, and Mohit Bansal. Extractive is not faithful: An investigation of broad unfaithfulness problems in extractive summarization. In Anna Rogers, Jordan BoydGraber, and Naoaki Okazaki (eds.), Proceedings of the 61st Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers) , pp. 2153-2174, Toronto, Canada, July 2023. Association for Computational Linguistics. doi: 10.18653/v1/2023.acl-long.120. URL https://aclanthology.org/2023.acl-long.120 .


## A SCALABILITY AND COMPUTATIONAL EFFICIENCY OF THE TREE-BUILDING PROCESS


To assess the computational efficiency and cost-effectiveness of RAPTOR's tree-building process, we conducted experiments on a consumer-grade laptop, specifically an Apple M1 Mac with 16GB of RAM. These experiments aimed to demonstrate the scalability and feasibility of RAPTOR on typical hardware. We varied the context length from 12,500 to 78,000 tokens and measured both the token expenditure and the time required to complete the tree-building process, from initial splitting and embedding to the construction of the final root node.


![Chart type: Line graph](images/page_15_pic_1.png)


**Figure:** Figure 5
**Caption:** Figure 5: Token cost as a function of document length for QASPER, NarrativeQA, and QuALITY. RAPTOR tree construction costs scale linearly with document length for each of the datasets.
**Description:**
Chart type: Line graph  
Title: Qasper, Narrative QA, Quality  
Axes: X — Document Length (Tokens), Y — Prompt + Completion Tokens  
Trend: 'Prompt + Completion Tokens' generally increase with 'Document Length (Tokens)' across all three datasets, with varying scales and variability in the relationship.  
Key data points:  
| Document Length (Tokens) | Prompt + Completion Tokens |  
|--------------------------|----------------------------|  
| 0–30,000                 | 0–45,000                   |  
| 0–40,000                 | 0–60,000                   |  
| 2,000–8,000              | 2,000–12,000               |


Token Expenditure We empirically investigated the relationship between the initial document length and the total number of tokens expended during the tree-building process, which includes both the prompt and completion tokens. The document lengths varied significantly across the three
