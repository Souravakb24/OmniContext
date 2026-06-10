
a smoothing function, we prevent the BLEU scores from dropping to zero, providing a more fair evaluation.

- Modified BLEU-4 Weighting: The original script applied a weight of 1 to the highest order n-gram (4-gram) and 0 to the rest in its BLEU-4 calculation (i.e., weights=(0, 0, 0, 1)). This approach may overly focus on 4-gram matches while neglecting lower-order matches. To provide a more balanced evaluation, we evenly distributed the weight across all n-gram levels, changing the weights for the BLEU-4 calculation to (0.25, 0.25, 0.25, 0.25).
- Tokenization before Mapping in METEOR Calculation: The original script utilized a simple split and map method for METEOR calculation. We fixed this by first tokenizing the text and then mapping the tokens. This amendment improves the accuracy of the METEOR calculation by taking into account the correct linguistic boundaries of words.

| Question: What is the central theme of the story?                                                                                    | Question: What is the central theme of the story?                                                                                                                                                                                                                                                                                                                                                                                                     |
|--------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|                                                                                                                                      | RAPTOR Fairy Godmother helps Cinderella attend a ball by transforming her rags. . . Cinderella impresses the Prince at the ball. . . she loses track of time and has to run home alone in                                                                                                                                                                                                                                                             |
| DPR                                                                                                                                  | Two mice were turned into footmen; four grasshoppers into white horses. Next, the Fairy touched Cinderella's rags, and they became rich satin robes, trimmed with point                                                                                                                                                                                                                                                                               |
| Question: How does Cinderella find a happy ending? The story of Cinderella involves her godmother, a fairy, who transforms a pumpkin | Question: How does Cinderella find a happy ending? The story of Cinderella involves her godmother, a fairy, who transforms a pumpkin                                                                                                                                                                                                                                                                                                                  |
| RAPTOR                                                                                                                               | into a grand coach with her wand and allows Cinderella to attend the ball. However, Cinderella must return home before the clock strikes eleven or her dress will turn back into rags. . . Cinderella impresses the Prince at the ball but leaves before he can find out who she is. . . The Prince searched for the owner of a lost glass slipper and found it belonged to Cinderella. She forgave her sisters and the Prince was glad to have found |
| DPR                                                                                                                                  | the clock had struck Eleven. . . The Prince was very much surprised when he missed Cinderella again, and leaving the ball, went in search of her. . . Fairy touched Cin- derella's rags, and they became rich satin robes, trimmed with point lace... Her old shoes became a charming pair of glass slippers, which shone like diamonds. 'Now go                                                                                                      |


*Table 13: Relevant excerpts from text retrieved by RAPTOR and DPR for the questions on the fairytale Cinderella.*


## I ANALYSIS OF DIFFERENT LAYERS ON RAPTOR'S PERFORMANCE


## I.1 HOW DO DIFFERENT LAYERS IMPACT PERFORMANCE ?


In this section, we present a detailed breakdown of RAPTOR's retrieval performance when querying different layers of the hierarchical tree structure for various stories. These tables validate the utility of RAPTOR's multi-layered structure for diverse query requirements.


*Table 14: Performance of RAPTOR when querying different layers of the tree for Story 2.*


| Layers Queried / Start Layer   | Layer 0 (Leaf Nodes)   | Layer 1   |   Layer 2 |
|--------------------------------|------------------------|-----------|-----------|
| 1 layer                        | 58.8                   | 47.1      |      41.1 |
| 2 layers                       | -                      | 64.7      |      52.9 |
| 3 layers                       | -                      | -         |      47.1 |
