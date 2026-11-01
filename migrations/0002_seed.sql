-- 由 scripts/seed.mjs 生成，勿手改

INSERT INTO books (slug, title, author, category, summary, status, sort, created_at, updated_at) VALUES ('fog-harbor', '雾港手记', '叶昭', '都市悬疑', '外滩尽头的旧钟楼停了十七年，直到有人把它重新拧响。', 'published', 0, 1792944000, 1792944000);
INSERT INTO chapters (book_id, idx, title, body, words, status, created_at, updated_at) SELECT id, 1, '停在四点的钟', '钟楼在十七年前就停了。这件事住在雾港的人都记得，就像记得每年十一月第一场雾会在早上七点前漫过防波堤。

四点零七分，秒针卡在一格半的位置，谁也不知道它是怎么停的。市政来修过两次，第一次说齿轮缺了一个，第二次说缺的那一个根本不存在。后来就没人再提了，铁门上了锁，锁上又挂了一块牌子，牌子上写着：危险，请勿靠近。

陈默第一次见到它，是在一个连路灯都懒得亮的夜里。他从码头出来，肩上还背着那台老掉牙的相机，走到钟楼底下的时候，忽然听见里面有一声很轻的响动，像有人用指甲敲了一下玻璃。

他站住。雾在他脚边缓慢地翻动，像一锅没煮开的水。那声响又来了，这次更清楚，隔着一层铁皮，一下，又一下，不急不缓，隔着十七年传过来。

他绕着钟楼走了一圈。门还是锁着的，锁上落了灰，灰尘完整得没有被碰过的痕迹。他抬头，四层楼高的钟面在雾里只剩下一个发白的圆圈，两根针贴在一起，指向四点零七分。

回到住处，他把相机里的照片倒出来看。白天拍的那些海鸥、缆绳、湿漉漉的石阶，全都正常。最后一张是他随手仰拍的钟面，他放大，再放大，看见指针底下压着一小片颜色——不是锈，像是有人把什么东西塞在了针和钟面之间。

他盯着屏幕看了很久，直到窗外的雾开始变薄。四点零七分，他把相机放下，忽然意识到今晚响的那一声，恰好是钟楼停下的时间。', 538, 'published', 1792944000, 1792944000 FROM books WHERE slug = 'fog-harbor';
INSERT INTO discussions (book_id, chapter_idx, user_id, name, body, status, likes, created_at) SELECT id, 1, NULL, '阿川', '第一段那句「雾像一锅没煮开的水」，在地铁上读了两遍。写得真稳。', 'approved', 12, 1793102400 FROM books WHERE slug = 'fog-harbor';
INSERT INTO discussions (book_id, chapter_idx, user_id, name, body, status, likes, created_at) SELECT id, 1, NULL, '晚风', '钟停在四点零七分，这个细节一出来我就知道后面要出事。作者很会埋。', 'approved', 8, 1793102400 FROM books WHERE slug = 'fog-harbor';
INSERT INTO discussions (book_id, chapter_idx, user_id, name, body, status, likes, created_at) SELECT id, 1, NULL, '林间', '排版太舒服了，宋体、行距、两侧留白都刚刚好，一口气读完三章。', 'approved', 5, 1793188800 FROM books WHERE slug = 'fog-harbor';
INSERT INTO chapters (book_id, idx, title, body, words, status, created_at, updated_at) SELECT id, 2, '值夜的人', '守钟人姓周，七十多岁，在码头一带很有名。不是因为他守过钟，而是因为他每天凌晨三点起床，沿着海岸线走一圈，风雨无阻。有人说他是在等船，也有人说他是在等人。

陈默找到他的时候，他正在给一只瘸腿的野猫分鱼干。听完来意，老人没有惊讶，只是把剩下的鱼干仔细收进铁盒，说：你听到的是第四次了。

“第四次？”

“前三次是 2009 年、2014 年、2019 年。”老人用手在膝盖上点了几下，像是在数一串看不见的珠子，“都是雾最大的那几天，都是在四点零七分。响了以后，总有人来找我，问我是不是也听见了。”

陈默问，那些人后来怎么样了。

老人没有立刻回答。他把铁盒盖好，放进怀里，站起来，膝盖发出很轻的一声响。“一个搬走了，一个不在了，还有一个，”他顿了顿，“还有一个，一直在给钟楼上油。”

“上油？”

“嗯。”老人指了指钟楼的方向，“铁门是他锁的，锁是他换的，牌子也是他挂的。他说，钟不是坏了，是不想走。”

雾从两个人中间穿过去。陈默闻到一股很淡的机油味，像刚刚有人在这里擦过什么。他回过头，码头空着，只有一条没人收的缆绳，在水面上一下一下地敲。', 454, 'published', 1792944000, 1792944000 FROM books WHERE slug = 'fog-harbor';
INSERT INTO discussions (book_id, chapter_idx, user_id, name, body, status, likes, created_at) SELECT id, 2, NULL, '老周', '「钟不是坏了，是不想走」——这句话单独拎出来就能当一篇小说的题眼。', 'approved', 21, 1793102400 FROM books WHERE slug = 'fog-harbor';
INSERT INTO discussions (book_id, chapter_idx, user_id, name, body, status, likes, created_at) SELECT id, 2, NULL, '阿川', '守钟人的设定比钟楼本身更有意思，期待后面解释他为什么每天走一圈。', 'approved', 6, 1793188800 FROM books WHERE slug = 'fog-harbor';
INSERT INTO chapters (book_id, idx, title, body, words, status, created_at, updated_at) SELECT id, 3, '潮水退去以后', '第二天早上，潮水退得很远，露出来一段平时看不见的石头台阶。台阶被海水泡了很多年，长满青苔，一级一级，通向钟楼背后那个没有门的小洞。

陈默在洞口蹲了很久。洞里的墙上有很多划痕，密密麻麻，像是有人在这里记过什么。他用手机照着，一行一行看过去，看出那是日期——每隔五年，就有一道新的。

最下面那一行是今年，字迹很新，刻痕还带着白色的粉末。

他伸手摸了一下，指尖沾到一点油。

身后传来脚步声。陈默回头，老人站在台阶上，手里提着一盏旧马灯，灯没点。他看了看洞里的划痕，又看了看陈默的手指，忽然笑了一下，说，你还是来了。

“您知道这里。”

“我知道。”老人把马灯放下，“十七年前，钟是我停的。那天我儿子出海，四点零七分，船没了。我上楼，把针按住，它就再也没走过。”

“那现在是谁在让它响？”

老人没有回答。他把马灯提起来，朝洞里照了一下。墙上那些日期被昏黄的光扫过去，一道一道，像一排很短的、不肯结束的句子。

远处传来一声汽笛。雾散了，钟楼上的两根针，还是贴在一起，指向四点零七分。', 426, 'published', 1792944000, 1792944000 FROM books WHERE slug = 'fog-harbor';
INSERT INTO books (slug, title, author, category, summary, status, sort, created_at, updated_at) VALUES ('long-night', '长夜与算术', '林见白', '科幻', '一艘以计算为燃料的船，载着最后一批不肯入睡的人。', 'published', 1, 1792512000, 1792512000);
INSERT INTO chapters (book_id, idx, title, body, words, status, created_at, updated_at) SELECT id, 1, '燃料', '船上的规矩很简单：每一道题，换一小时的灯。

这是“长夜号”离开地球的第九年。太阳早就退化成一个不太好用的词，窗外没有星，只有一种均匀的、比黑更黑的颜色。维持这艘船运转的不是燃料棒，也不是核聚变，而是计算——具体地说，是一群人持续不断地思考。

舰长管这叫“认知燃料”。他说，人的大脑在解决真正困难的问题时，会释放某种还没有被完全理解的能量，而长夜号的引擎正好需要这种能量。

于是船上有了一个奇怪的制度。每天早上，所有人到观察舱集合，领一道题。题目不难也不易，恰好卡在你需要认真想很久的地方。想出来的人，可以换到一整天的灯和热水；想不出来的人，就只能待在暗处，听着别人的笔尖在纸上沙沙地走。

林遇是这艘船上唯一一个从来没交过答案的人。她每天领到题，坐在角落，把纸翻过来，在背面画画。

负责记录的年轻人问她，你在画什么。

她说，我在算出题的人是谁。', 365, 'published', 1792512000, 1792512000 FROM books WHERE slug = 'long-night';
INSERT INTO discussions (book_id, chapter_idx, user_id, name, body, status, likes, created_at) SELECT id, 1, NULL, '早睡失败', '用「每一道题换一小时的灯」来写燃料，这个换算比硬科幻解释更有说服力。', 'approved', 9, 1792670400 FROM books WHERE slug = 'long-night';
INSERT INTO discussions (book_id, chapter_idx, user_id, name, body, status, likes, created_at) SELECT id, 1, NULL, '南岸', '唯一不交答案的人在自己算出题的人是谁，这个开头我喜欢。', 'approved', 4, 1792756800 FROM books WHERE slug = 'long-night';
INSERT INTO chapters (book_id, idx, title, body, words, status, created_at, updated_at) SELECT id, 2, '第七次校准', '第七年，船开始出现偏差。

仪器没有坏，坐标也没有错，只是那颗本该在正前方的行星，一天比一天偏左。领航员反复校验了三遍，最后把结果写在黑板上：每过二十四小时，偏零点七度。

舰长召集全船开会。有人说引力异常，有人说仪器老化，有人说，也许我们一直在追的那颗行星，自己动过。

只有林遇站起来说，偏的不是行星，是我们。

“什么意思？”

“船在按我们的想法走。”她说，“我们每天想什么，船就朝什么方向偏一点。九年了，我们想的都是同一件事——回家。所以它一直在往地球的方向偏。”

舱里安静了很久。有人笑了一下，笑得很难听。

舰长问她，那该怎么办。

“要么换一批人，”她说，“要么换一个目标。”

那天晚上没有人领题。观察舱的灯一直亮着，亮到最后自己灭掉。黑暗里，林遇听见有人在很小声地算一道很简单的减法：回家的距离，减去已经走过的距离。

答案是一个负数。', 359, 'published', 1792512000, 1792512000 FROM books WHERE slug = 'long-night';
INSERT INTO chapters (book_id, idx, title, body, words, status, created_at, updated_at) SELECT id, 3, '睡着的人', '第三年的时候，船上出现过一个“睡着的人”。

所谓睡着，不是死亡。他的心跳还在，体温还在，只是不再提出问题，也不再回答任何问题。医学官检查了七天，最后在报告上写：该船员已停止计算。

从那以后，“睡着”成了一个不能随便说的词。人们宁愿说自己累了，也不愿说自己想不出下一道题。因为在长夜号上，不计算的人，等于不存在。

林遇偷偷去看过那个睡着的人。他躺在冷藏舱最里面的位置，脸上很平静，像一个终于做完作业的孩子。她在他床边坐了一下午，什么也没算。

那天回去，她在纸上写下一行字：如果一个东西只能靠不停地想来维持，那它本来就不该存在。

她把纸折好，放进制服口袋。第二天早上，她照常去领题，照常坐在角落画画。只是那天的画里，第一次出现了窗口，窗外有光。', 315, 'published', 1792512000, 1792512000 FROM books WHERE slug = 'long-night';
INSERT INTO books (slug, title, author, category, summary, status, sort, created_at, updated_at) VALUES ('nanling', '南岭旧事', '陈砚', '乡土', '山坳里的祠堂、雨季，和一场迟到三十年的葬礼。', 'published', 2, 1791475200, 1791475200);
INSERT INTO chapters (book_id, idx, title, body, words, status, created_at, updated_at) SELECT id, 1, '雨从清明开始', '南岭的雨是从清明那天开始下的。

先是夜里落一阵，早上停，地面湿一层，太阳出来一晒，什么痕迹也不留。后来就不停了，从早到晚，屋檐下挂起一条线，落进天井，砸在青石板上，溅起来的水珠细得像雾。

阿婆说，今年的雨不对劲。她坐在门槛上剥豆子，剥一颗，看一眼山。山上那些坟，被雨泡得发黑，草长得比去年高。

“你二伯要回来了。”她忽然说。

我愣了一下。二伯走了三十年，走的时候我还没出生。家里只有一张他的照片，黑白的，边角卷起来，放在祠堂的供桌下面，跟一堆旧账本压在一起。

“他不回来。”我说。

阿婆没抬头，把最后一颗豆子丢进盆里，说，回来的，雨把他叫回来了。', 267, 'published', 1791475200, 1791475200 FROM books WHERE slug = 'nanling';
INSERT INTO chapters (book_id, idx, title, body, words, status, created_at, updated_at) SELECT id, 2, '祠堂里的名字', '祠堂的墙上刻着很多名字。

最上面一层是清朝的，字被香火熏得发黄；往下一层是民国，笔画粗一些；再往下，是我们这一辈，刻得深浅不一，看得出是不同的人拿着同一把凿子，隔了很多年，一个一个添上去的。

二伯的名字在第三排，中间偏右。刻得很浅，像刻的人当时没什么力气。我伸手摸了一下，指腹上留了一层薄灰。

族长进来的时候，我正蹲在墙边看那些名字。他把伞收在门外，抖了抖水，说，你阿婆让你来的？

我点头。

“她说什么了？”

“她说我二伯要回来。”

族长看了我很久，忽然笑了一下，笑容很快收起来。他走到供桌前，把那本旧账翻开，翻到最后一页，指着一行字让我看。

那行字写的是三十年前的一个日期，后面只有两个字：未归。

“不是没回来过。”族长说，“是回来过，没进这个门。”', 317, 'published', 1791475200, 1791475200 FROM books WHERE slug = 'nanling';
INSERT INTO chapters (book_id, idx, title, body, words, status, created_at, updated_at) SELECT id, 3, '上山', '雨停的那天早上，我们去上山。

路很滑，阿婆走得很慢，一只手扶着我的胳膊，一只手提着竹篮。篮子里是纸钱、米酒，还有一件叠得整整齐齐的旧衬衫。衬衫是二伯的，三十年前留在家里的，阿婆每年拿出来晒一次，晒完再叠好，放回去。

到了半山腰，她让我停下。那里的草被人踩过，倒伏成一条窄路，通向一片没有碑的土包。

“就这儿。”她说。

我们在土包前站了很久。阿婆把衬衫放在地上，又把酒洒了一圈，动作很慢，像在完成一件做了很多遍的事。

“他三十年前回来过，站在祠堂门口，没进去。”她说，“他说他没脸进。我说，那你以后就别进了。他就真的没再进。”

风从山那边过来，把纸钱吹得翻起来。我抬头，看见雾在山谷里一层一层地退，露出很远的地方——那里有一条白线，不知道是河，还是公路。

“阿婆，”我问，“他知道你每年都来吗？”

她把竹篮收好，拍了拍膝盖上的土，说，知道的。然后就转身往山下走，没有再回头。', 378, 'published', 1791475200, 1791475200 FROM books WHERE slug = 'nanling';
