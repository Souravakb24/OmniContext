
![Blocks](images/page_16_pic_1.png)


**Figure:** Figure 5
**Caption:** Figure 5: Summary of Main Techniques for Different Query Levels in Data augmented LLM applications
**Description:**
Blocks:
- Level 0
- Level 1 ~ 2 (Facts)
- Level 3 ~ 4 (Rationales)
- Bare LLM
- Explicit Facts
- Implicit Facts
- Interpretable Rationales
- Hidden Rationales
- Chain-of-Thoughts
- RAG
- Iterative RAG
- Prompt Tuning
- Offline Learning
- RAG on Graph / Tree
- CoT Prompting
- In Context Learning
- Text-to-SQL
- Model Fine Tuning

Connections:
- Level 0 -> Bare LLM
- Level 1 ~ 2 (Facts) -> Explicit Facts
- Level 1 ~ 2 (Facts) -> Implicit Facts
- Level 3 ~ 4 (Rationales) -> Interpretable Rationales
- Level 3 ~ 4 (Rationales) -> Hidden Rationales
- Bare LLM -> Chain-of-Thoughts
- Explicit Facts -> RAG
- Implicit Facts -> Iterative RAG
- Implicit Facts -> RAG on Graph / Tree
- Implicit Facts -> Text-to-SQL
- Interpretable Rationales -> Prompt Tuning
- Interpretable Rationales -> CoT Prompting
- Hidden Rationales -> Offline Learning
- Hidden Rationales -> In Context Learning
- Hidden Rationales -> Model Fine Tuning

Summary: The image illustrates a progression of language model capabilities and corresponding techniques, organized by four levels. Level 0 represents foundational bare LLM capabilities, while Levels 1–2 focus on explicit and implicit facts through retrieval-augmented generation (RAG) methods. Levels 3–4 address interpretable and hidden rationales using prompt tuning, offline learning, and in-context adaptations. Dashed lines connect conceptual layers to specific methods, demonstrating how each level’s reasoning challenges are addressed by distinct technical approaches.


Despite the robust in-context learning capabilities of LLMs, accurately identifying rationales or optimal examples for complex and lengthy logical chains remains a significant challenge. Additionally, the provision of extensive external prior knowledge can also pose challenges to the inference capabilities of LLMs. Given these factors, fine-tuning emerges as a promising approach. It not only utilizes the extensive foundational knowledge that LLMs acquire during pretraining but also enables them to rapidly grasp new domain rationales. This method provides a viable path for enhancing the adaptability and effectiveness of LLMs in tackling advanced and specialized tasks.


Instruction tuning is a common method for infusing new capabilities into LLMs, typically involving supervised finetuning using paired (instruction, output) data. There are three primary methods for constructing an instruction dataset: a) deriving from existing datasets [161, 162], b) manually creating through handcrafted instructions [163, 164, 165], and c) generating synthetic data using powerful LLMs [166, 154]. Additionally, numerous studies [167, 168, 169] have explored how to optimize the data distribution within instruction datasets to enhance fine-tuning effectiveness. However, when building data-augmented LLM applications, fine-tuning remains a relatively costly method in terms of time and computational resources. Recently, several efforts have been made to reduce the costs associated with fine-tuning large models. Adapter tuning, for instance, involves integrating small adapter models with LLMs while freezing the parameters of the LLM during fine-tuning and only optimizing the weights of the adapter [170, 171, 172, 173]. Prefix Tuning and Prompt Tuning involve adding a set of trainable vectors before the input, which are optimized during training to enhance the performance of the LLM [174, 175, 176, 177, 178]. Low-Rank Adaptation [179, 180, 181, 182, 183] reduces the number of trainable parameters needed for adapting to downstream tasks by imposing low-rank constraints on each dense layer to approximate the update matrices.


In recent years, there has been a substantial amount of work using supervised fine-tuning to enhance the capabilities of LLMs in specialized domains such as mathematical reasoning, finance, law, and healthcare [184, 185, 186]. For instance, ChatTimeLlama [187] introduced an interpretable time reasoning instruction tuning dataset and fine-tuned on LLaMA [188] to significantly improve the model's complex temporal reasoning, future event prediction capabilities, and interpretability. LISA [189] leveraged a small set of segment data samples that involve reasoning to fine-tune the multimodal LLM LLaVA, which resulted in substantial improvements in reasoning segmentation capabilities. MAmmoTH [190] ingeniously constructed a mathematical example dataset that uniquely combines Chain of Thought and Program of Thought reasoning, ensuring broad coverage across different mathematical domains and enhancing the LLM's ability to solve general mathematical problems. ReFT [191] proposes a method for learning from multiple annotated reasoning paths corresponding to the same problem. It automatically samples numerous reasoning trajectories for a given mathematical problem, leveraging the correct answer to generate reward signals. ChatDoctor [192] utilized a large dataset of 100,000 patient-doctor dialogues from a widely-used online medical consultation platform to fine-tune LLaMA, significantly enhancing the model's ability to understand patient needs and provide effective recommendations. FinGPT [193] developed an open-source LLM fine-tuned on financial data using automated data curation and lightweight, low-rank adaptation techniques. DISC-LawLLM [194] created a supervised fine-tuning
