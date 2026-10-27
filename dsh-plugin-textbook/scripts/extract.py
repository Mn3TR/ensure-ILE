# -*- coding: utf-8 -*-
"""把教材 PDF 抽成运行时可直接读的 JSON 语料（开发期脚本，不进产物）。

为什么要有这一步：打包里已经删掉了 Python 载荷（能跑 agent 的机器上没有 PyMuPDF），
而这些 PDF 里 6 本有文字层、1 本（人教A数学必修一）是纯扫描件。于是把「读 PDF」这件事
固定在开发机上做一次，产物（data/books/*.json + data/index.json）入库，运行时零依赖。

用法：
    python scripts/extract.py                       # 默认读数据根里的 教材/ 目录
    python scripts/extract.py --source <教材目录>    # 换一份来源
    python scripts/extract.py --out data            # 换输出目录
环境变量 ENSURE_ILE_TEXTBOOK_DIR 可代替 --source。

语料格式（dsh-plugin-textbook/src/data.ts 是唯一消费者）：
    data/index.json    {generatedAt, source, books: [BookSummary]}
    data/books/<id>.json
        {id, title, subject, publisher, pages, textbookOffset, textAvailable,
         sections: [{level, title, pdfPage, endPage}], pagesText: (string|null)[]}
    pagesText 为 0 基：pagesText[i] 是 PDF 第 i+1 页正文；null = 该页无文字层。
"""
import argparse
import datetime
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')
import pymupdf

# 文件名 → 元数据。页码换算（PDF 页 = 课本页 + offset）取自 教材索引.md。
BOOKS = [
    ('人教版A·数学必修第一册.pdf', 'renjiaoA-math-1', 'math', '人民教育出版社（人教A版）', 7),
    ('人教版A·数学必修第二册.pdf', 'renjiaoA-math-2', 'math', '人民教育出版社（人教A版）', 7),
    ('人教版·化学必修第一册.pdf', 'renjiao-chem-1', 'chem', '人民教育出版社', 5),
    ('人教版·化学必修第二册.pdf', 'renjiao-chem-2', 'chem', '人民教育出版社', 5),
    ('教科版·物理必修第一册.pdf', 'jiaoke-phys-1', 'physics', '教育科学出版社', 9),
    ('教科版·物理必修第二册.pdf', 'jiaoke-phys-2', 'physics', '教育科学出版社', 4),
    ('教科版·物理必修第三册.pdf', 'jiaoke-phys-3', 'physics', '教育科学出版社', 4),
]

# 行内多余空白折叠；全角空格统一；扫描页的水印/页眉太脏，只保留有实际内容的行。
SPACE = re.compile(r'[ \t\u3000\xa0]+')


def clean(text):
    """把一页的原始文本折成可读的多行字符串；没有内容就返回 None。"""
    lines = []
    for raw in text.splitlines():
        line = SPACE.sub(' ', raw).strip()
        if line:
            lines.append(line)
    body = '\n'.join(lines)
    # 少于 6 个字符基本是页眉页脚或水印残渣
    return body if len(body) >= 6 else None


def sections_from_toc(toc, pages):
    """书签 → 节表；层级压到 2 级，endPage 取下一个同级或更高级标题。"""
    entries = []
    for level, title, page in toc:
        title = SPACE.sub(' ', str(title)).strip()
        page = int(page)
        if not title or page < 1:
            continue
        entries.append({'level': 1 if level <= 1 else 2, 'title': title, 'pdfPage': min(page, pages)})
    out = []
    for index, entry in enumerate(entries):
        end = pages + 1
        for later in entries[index + 1:]:
            if later['level'] <= entry['level']:
                end = later['pdfPage']
                break
        item = dict(entry)
        item['endPage'] = max(end, entry['pdfPage'] + 1)
        out.append(item)
    return out


def extract(source, name, book_id, subject, publisher, offset):
    path = os.path.join(source, name)
    doc = pymupdf.open(path)
    pages = doc.page_count
    pages_text = []
    for index in range(pages):
        try:
            pages_text.append(clean(doc[index].get_text()))
        except Exception as error:  # 个别页解析失败不该让整本作废
            print('  ! %s p%d: %s' % (book_id, index + 1, error))
            pages_text.append(None)
    has_text = sum(1 for item in pages_text if item) >= max(3, pages // 20)
    return {
        'id': book_id,
        'title': os.path.splitext(name)[0],
        'subject': subject,
        'publisher': publisher,
        'pages': pages,
        'textbookOffset': offset,
        'textAvailable': bool(has_text),
        'sections': sections_from_toc(doc.get_toc(), pages),
        'pagesText': pages_text,
    }


def main():
    parser = argparse.ArgumentParser()
    default_source = os.environ.get('ENSURE_ILE_TEXTBOOK_DIR') or os.path.join(
        os.getcwd(), '.ensure-ile', 'deepseek-harness', 'default-workspace', '教材')
    parser.add_argument('--source', default=default_source)
    # 默认写回包内的 data/，与运行目录无关（从仓库根或包内跑都一样）
    package_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    parser.add_argument('--out', default=os.path.join(package_root, 'data'))
    args = parser.parse_args()
    if not os.path.isdir(args.source):
        raise SystemExit('找不到教材目录：' + args.source)

    books_dir = os.path.join(args.out, 'books')
    os.makedirs(books_dir, exist_ok=True)
    summaries = []
    for name, book_id, subject, publisher, offset in BOOKS:
        print('抽取 %s …' % book_id)
        book = extract(args.source, name, book_id, subject, publisher, offset)
        target = os.path.join(books_dir, book_id + '.json')
        with open(target, 'w', encoding='utf-8', newline='\n') as handle:
            json.dump(book, handle, ensure_ascii=False, separators=(',', ':'))
        size = os.path.getsize(target)
        typed = sum(1 for page in book['pagesText'] if page)
        print('  %d 页，有文字 %d 页，%d 节，%.1f MB' % (book['pages'], typed, len(book['sections']), size / 1048576))
        summaries.append({key: book[key] for key in
                          ('id', 'title', 'subject', 'publisher', 'pages', 'textbookOffset', 'textAvailable')}
                         | {'sectionCount': len(book['sections'])})

    index = {
        'generatedAt': datetime.datetime.now().astimezone().isoformat(timespec='seconds'),
        'source': os.path.abspath(args.source),
        'books': summaries,
    }
    with open(os.path.join(args.out, 'index.json'), 'w', encoding='utf-8', newline='\n') as handle:
        json.dump(index, handle, ensure_ascii=False, indent=2)
        handle.write('\n')
    print('完成：%d 本' % len(summaries))


if __name__ == '__main__':
    main()
