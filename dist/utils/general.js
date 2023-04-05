/**
 * Converts a `ArrayBuffer` to a hex string
 */
export const bufferToHex = (arrayBuffer) => [...new Uint8Array(arrayBuffer)]
    .map((x) => `00${x.toString(16).slice(-2)}`)
    .join("");
/**
 * Converts a `Uint8Array` to an `ArrayBuffer`
 */
export const typedArrayToBuffer = (array) => {
    return array.buffer.slice(array.byteOffset, array.byteLength + array.byteOffset);
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy91dGlscy9nZW5lcmFsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOztHQUVHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sV0FBVyxHQUFHLENBQUMsV0FBd0IsRUFBVSxFQUFFLENBQzlELENBQUMsR0FBRyxJQUFJLFVBQVUsQ0FBQyxXQUFXLENBQUMsQ0FBQztLQUM3QixHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0tBQzNDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUVkOztHQUVHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxLQUFpQixFQUFlLEVBQUU7SUFDbkUsT0FBTyxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FDdkIsS0FBSyxDQUFDLFVBQVUsRUFDaEIsS0FBSyxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUMsVUFBVSxDQUNwQyxDQUFDO0FBQ0osQ0FBQyxDQUFDIn0=