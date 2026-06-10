
![Blocks](images/page_5_pic_1.png)


**Figure:** Figure 2
**Caption:** Figure 2: SELF-RAG training examples. The left example does not require retrieval while the right one requires retrieval; thus, passages are inserted. More examples are in Appendix Table 4.
**Description:**
Blocks:
- Input: "Write an essay of your best summer vacation"
- Input: "How did US states get their names?"
- Output: "My best summer vacation was a magical escape to the coastal town of Santorini. The azur waters, charming white-washed building are unforgettable."
- Output: "1 of 50 states names come from persons. For instance, Louisiana was named in honor of King Louis XIV of France and Georgia was named after King George II."
- Augmented Output: "My best summer vacation was a magical escape to the coastal town of Santorini. No Retrieval. The azur waters, charming white-washed building are unforgettable experience."
- Augmented Output: "11 of 50 states' names come from person. Supported For instance, Louisiana was named after King Louis XIV, and Georgia was named after King George II."
- Critic LM
- Retriever
- "Retrieve" (in various contexts)
- "Relevant" labels (in green)
- "Partially" label (in orange)
- "Utill" labels (in blue)
- Numbered steps (1, 2)

Connections:
- Input (first) -> Output -> Augmented Output
- Input (second) -> Output -> Augmented Output
- Critic LM -> Retriever
- Retrieve → [Step 1] → (with "Relevant", "Supported", "Retrieve" boxes)
- Retrieve → [Step 2] → (with "Relevant", "Partially", "Utill" boxes)
- Arrows from "Input" blocks to "Output" blocks
- Arrows from "Output" blocks to "Augmented Output" blocks
- Arrows from "Critic LM" to "Retriever" and retrieval steps
- Arrows for numbered steps (1, 2) with context labels

Summary: The image depicts a flowchart illustrating a system for generating or enhancing text outputs based on input prompts. It shows two parallel processing paths: one for crafting a personal essay (e.g., about a summer vacation) and another for answering factual questions (e.g., US state name origins). Each path involves initial "Input," "Output," and "Augmented Output" stages, where the augmented outputs integrate retrieval mechanisms. Components like "Critic LM" (likely a language model component) and "Retriever" (a module for pulling relevant information) drive the process, with numbered steps (1 and 2) indicating retrieval actions. Augmented outputs show added layers of evidence (e.g., "Relevant," "Supported," "Partially") derived from retrieved data, visualized through color-coded tags (green, orange, blue). The flow emphasizes how retrieval and evaluation components refine raw outputs into more precise, data-backed responses.


used to generate such feedback (Liu et al., 2023b). However, depending on such proprietary LMs can raise API costs and diminish reproducibility (Chen et al., 2023). We create supervised data by prompting GPT-4 to generate reflection tokens and then distill their knowledge into an in-house C . For each group of reflection tokens, we randomly sample instances from the original training data: { X sample , Y sample } ∼ { X,Y } . As different reflection token groups have their own definitions and input, as shown in Table 1, we use different instruction prompts for them. Here, we use Retrieve as an example. We prompt GPT-4 with a type-specific instruction ('Given an instruction, make a judgment on whether finding some external documents from the web helps to generate a better response.') followed by few-shot demonstrations I the original task input x and output y to predict an appropriate reflection token as text: p ( r | I, x, y ) . Manual assessment reveals that GPT-4 reflection token predictions show high agreement with human evaluations. We collect 4k-20k supervised training data for each type and combine them to form training data for C . Appendix Section D shows the full list of instructions, and A.1 contains more details and our analysis.


Critic learning. After we collect training data D critic , we initialize C with a pre-trained LM and train it on D critic using a standard conditional language modeling objective, maximizing likelihood:


$$
\max _ { \mathcal { C } } \mathbb { E } _ { ( ( x , y ) , r ) \sim \mathcal { D } _ { c r i t i c } } \log p _ { \mathcal { C } } ( r | x , y ) , \, r \text { for reflection tokens} .
$$


Though the initial model can be any pre-trained LM, we use the same one as the generator LM (i.e., Llama 2-7B; Touvron et al. 2023) for C initialization. The critic achieves a higher than 90% agreement with GPT-4-based predictions on most reflection token categories (Appendix Table 5).


## 3.2.2 TRAINING THE GENERATOR MODEL


Data collection for generator. Given an input-output pair ( x, y ) , we augment the original output y using the retrieval and critic models to create supervised data that precisely mimics the SELFRAG inference-time process (Section 3.1). For each segment y t ∈ y , we run C to assess whether additional passages could help to enhance generation. If retrieval is required, the retrieval special token Retrieve = Yes is added, and R retrieves the top K passages, D . For each passage, C further evaluates whether the passage is relevant and predicts ISREL . If a passage is relevant, C further evaluates whether the passage supports the model generation and predicts ISSUP . Critique tokens ISREL and ISSUP are appended after the retrieved passage or generations. At the end of the output, y (or y T ), C predicts the overall utility token ISUSE , and an augmented output with reflection tokens and the original input pair is added to D gen . See the example training data in Figure 2.


Generator learning. We train the generator model M by training on the curated corpus augmented with reflection tokens D gen using the standard next token objective:


$$
\max _ { \mathcal { M } } \mathbb { E } _ { ( x , y , r ) \sim \mathcal { D } _ { g e n } } \log p _ { \mathcal { M } } ( y , r | x ) .
$$


Unlike C training (Eq. 1), M learns to predict the target output as well as the reflection tokens. During training, we mask out the retrieved text chunks (surrounded by <p> and </p> in Figure 2) for loss calculation and expand the original vocabulary V with a set of reflection tokens { Critique , Retrieve } .


Connections to prior work on learning with critique. Recent work incorporates additional critique (feedback) during training, e.g., RLHF (Ouyang et al. 2022) via PPO. While PPO relies on separate reward models during training, we compute critique offline and directly insert them into the training corpus, where the generator LM is trained with a standard LM objective. This significantly reduces training costs compared to PPO. Our work also relates to prior work that incorporates special tokens to control generation (Keskar et al., 2019; Lu et al., 2022; Korbak et al., 2023). Our SELF-RAG learns to generate special tokens to evaluate its own prediction after each generated segment, enabling the use of a soft re-ranking mechanism or hard constraints at inference (discussed next).
