import {
  MutableRefObject,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Card, CloseButton } from "react-bootstrap";
import { useTagsDispatch } from "@/contexts/TagContext";
import Bookmark from "@/types/Bookmarks/Bookmark";
import TagAction from "@/types/Bookmarks/TagAction";
import DeleteModal from "./DeleteModal";
import "./bookmarkCard.scss";
import { useBookmarkDispatch } from "@/contexts/BookmarkContext";
import BookmarkAction from "@/types/Bookmarks/BookmarkAction";
import Tag from "@/types/Bookmarks/Tag";
import api from "@/api/Api";
import { ScrapableBookmarkToggle } from "./ScrapableToggle";

const IMAGE_DIR = process.env.NEXT_PUBLIC_IMAGE_DIR;

interface BookmarkProp {
  bookmark: Bookmark;
}

/**
 *  function to add a Tag to a Bookmark
 * @param bookmark bookmark
 * @param trimmedInput string title of tag
 * @returns Promise<TagAction> populates bookmark with the tags.
 */
async function addTagToBookmark(
  bookmark: Bookmark,
  trimmedInput: string,
): Promise<TagAction> {
  let action: TagAction = {
    type: "add",
    id: -1,
    title: "",
    bookmark: bookmark,
  };

  await api.addBookmarkTag(bookmark?.id, trimmedInput).then((response) => {
    // It will always be the last index since it was the last added.
    // let index = response.data.length - 1;
    action.id = response.data.id;
    action.title = response.data.title;
    bookmark.tags.push({ id: action.id, title: action.title });
  });

  return action;
}

export default function BookmarkCard({ bookmark }: BookmarkProp) {
  const dispatch = useTagsDispatch();
  const bkmkDispatch = useBookmarkDispatch();
  const [input, setInput] = useState("");
  const [inEditMode, setEditMode] = useState(false);
  const [editScrapable, setScrable] = useState(bookmark.scrapable);
  const [strTags, setStrTags] = useState<string[]>([]);
  const [show, setShow] = useState(false);
  /*
   * Create copies to compare state, its technically shallow but I have no nested properties
   * that are edited in the partial update. For example Tags would be shallow copied.
   * Thus set the before and after, initially they are the same.
   */
  const beforeEdit = useRef({ ...bookmark });
  const edit = useRef({ ...bookmark });

  // Set tags on the card from the bookmark json object.
  useEffect(() => {
    if (bookmark) {
      const tagList: string[] = [];
      bookmark.tags.map((tag: Tag) => {
        tagList.push(tag.title);
      });
      setStrTags(tagList);
    }
  }, [bookmark]);

  const handleClose = () => {
    setShow(false);
  };
  const handleShow = () => setShow(true);

  const handleEdits = (inEditMode: boolean) => {
    if (!inEditMode && isChanges(beforeEdit, edit)) {
      sendPatch(edit.current);
      beforeEdit.current = { ...edit.current };
    }
  };

  const sendPatch = (edit: Bookmark) => {
    console.log(edit);
    api.updateBookmark({
      id: edit.id,
      title: edit.title,
      url: edit.url,
      isScrapable: edit.scrapable,
    });
  };

  const isChanges = (
    beforeEdit: MutableRefObject<Bookmark>,
    edit: MutableRefObject<Bookmark>,
  ) => {
    edit.current.scrapable = editScrapable;
    return JSON.stringify(beforeEdit.current) != JSON.stringify(edit.current);
  };

  /**
   * Decrement all the tags associated to this bookmark
   * then remove the bookmark itself.
   * Remove this from the inverse list of tags -> bookmarks when that map is created
   *
   * Consider creating a typescript class to act a handler for
   * the state of bookmarks.
   */
  function deleteBkmk() {
    let action: BookmarkAction = {
      type: "delete",
      bookmarkId: bookmark.id,
      bookmarks: [],
    };
    // delete the bookmark.
    bkmkDispatch(action);

    // decrement the bookmark counters
    bookmark.tags.forEach((tag) => {
      const idx = getIdxFromTitle(tag.title);
      const tagId = bookmark.tags[idx].id;
      // update the sidebar.
      let action: TagAction = {
        type: "delete",
        id: tagId,
        title: "",
        bookmark,
      };
      dispatch(action);
    });
  }

  const deleteTag = (title: string) => {
    const idx = getIdxFromTitle(title);
    const tagId = bookmark.tags[idx].id;
    if (bookmark) {
      bookmark.tags = bookmark.tags.filter((t, i) => i !== idx);
    }
    api.deleteTagById(bookmark.id, tagId);
    let titles = bookmark.tags.map((t) => t.title); // just the titles display
    setStrTags(titles);

    // update the sidebar.
    let action: TagAction = {
      type: "delete",
      id: tagId,
      title: "",
      bookmark,
    };
    dispatch(action);
  };

  function getIdxFromTitle(title: string): number {
    return bookmark.tags.findIndex((t) => t.title == title);
  }

  const onChange = (e: any) => {
    const { value } = e.target;
    setInput(value);
  };

  function onKeyDown(e: any) {
    const { keyCode } = e;
    const trimmedInput = input.trim();
    if (
      // Enter or space
      (keyCode === 32 || keyCode == 13) &&
      trimmedInput.length &&
      !strTags.includes(trimmedInput)
    ) {
      e.preventDefault();
      setStrTags((prevState) => [...prevState, trimmedInput]);

      strTags.push(trimmedInput);
      setStrTags([...strTags]);
      addTagToBookmark(bookmark, trimmedInput).then((action) => {
        dispatch(action);
      });

      setInput("");
    }
    // backspace delete
    if (keyCode === 8 && !input.length && bookmark?.tags.length) {
      e.preventDefault();
      let tagsCopy = [...strTags];
      let poppedTag = tagsCopy.pop();
      if (poppedTag) deleteTag(poppedTag);
      setInput(poppedTag ? poppedTag : "");
    }
  }

  function resolveCardType(): ReactNode {
    return bookmark.screenshotUrl ? overlayCard() : plainCard();
  }

  function overlayCard(): ReactNode {
    return (
      <Card className="bookmark-card">
        <img
          className="card-img-top"
          src={IMAGE_DIR + bookmark.screenshotUrl}
          alt="screenshot preview"
        />
        <CardBody />
      </Card>
    );
  }

  const CardBody = () => {
    return (
      <Card.Body>
        <Card.Title>{inEditMode ? <EditTitle /> : bookmark.title}</Card.Title>
        {inEditMode ? (
          <EditUrl />
        ) : (
          <Card.Link target="_blank" href={bookmark.url}>
            {bookmark.url}
          </Card.Link>
        )}
      </Card.Body>
    );
  };

  const EditTitle = () => {
    return (
      <input
        className="title-edit"
        defaultValue={bookmark.title}
        data-testid={`${bookmark.title}-edit-input`}
        onChange={(e) => {
          const { value } = e.target;
          edit.current.title = value;
          bookmark.title = value;
        }}
        onKeyDown={(e) => {
          const { key } = e;
          if (key === "Enter" || key === "NumpadEnter") {
            changeEditMode();
          }
        }}
      />
    );
  };

  const EditUrl = () => {
    return (
      <div>
        <input
          className="url-edit"
          defaultValue={bookmark.url}
          data-testid={`${bookmark.url}-edit-input`}
          onChange={(e) => {
            const { value } = e.target;
            edit.current.url = value;
            bookmark.url = value;
          }}
          onKeyDown={(e) => {
            const { key } = e;
            if (key === "Enter") {
              changeEditMode();
            }
          }}
        />
        <div className="mt-4">
          <ScrapableBookmarkToggle
            isScrapable={editScrapable}
            setScrapable={setScrable}
          />
        </div>
      </div>
    );
  };

  function changeEditMode() {
    setEditMode(!inEditMode);
    handleEdits(!inEditMode);
  }

  function plainCard(): ReactNode {
    return <CardBody />;
  }

  return (
    <div data-testid={`bookmark-${bookmark.title}`} className="mx-2">
      <Card className="bookmark-card">
        <div className="card-header">
          <CloseButton
            className="delete-bookmark-icon inline float-right"
            onClick={handleShow}
            data-testid={`bk-id-${bookmark.id}-deleteBtn`}
          />
          <button
            onClick={() => {
              changeEditMode();
            }}
            className="btn edit-bookmark-icon"
          >
            <i className="bi bi-pen"></i>
          </button>
        </div>
        <DeleteModal
          show={show}
          handleClose={handleClose}
          deleteBkmk={deleteBkmk}
        />
        {resolveCardType()}
        <Card.Footer className="card-footer">
          <div className="container">
            {strTags.map((tag, id) => (
              <button
                key={id}
                onClick={() => deleteTag(tag)}
                type="button"
                className="pill-button"
                data-testid={`${tag}-tag-${bookmark.id}-bk`}
              >
                {tag}
                <i className="xtag bi bi-journal-x"></i>
              </button>
            ))}

            <input
              value={input}
              placeholder="Enter a tag"
              data-testid={`${bookmark.title}-input`}
              onKeyDown={onKeyDown}
              onChange={onChange}
            />
          </div>
        </Card.Footer>
      </Card>
    </div>
  );
}
